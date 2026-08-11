import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { entitlementForUser } from '@/lib/entitlements';
import { hasFaceProcessingConsent } from '@/lib/intelligence/face-gate';
import { intelligenceConfig, MAGIC_ANALYSIS_VERSION } from '@/lib/intelligence/config';
import { PEOPLE_INTELLIGENCE_VERSION } from '@/lib/people-intelligence';
import {
  FAVORITE_PEOPLE_RECOGNITION_VERSION,
  favoriteGeneration,
  favoritePeopleLimitForPlan,
  isUsableFavoriteLabel,
  normalizeFavoritePeople,
} from '@/lib/favorite-people';
import {
  enrollFavoritePerson,
  favoritePeopleEngineReady,
  finalizeFavoriteRemoval,
  removeFavoriteEnrollment,
} from '@/lib/favorite-people-recognition.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function cloudRolloutReady(user) {
  const config = intelligenceConfig();
  return Boolean(
    config.magicSorterEnabled
      && config.localFaceGateEnabled
      && config.faceProcessingEnabled
      && (!config.consentRequired || hasFaceProcessingConsent(user || {}))
      && favoritePeopleEngineReady()
  );
}

function safePersonLabel(person = {}) {
  if (person.isSelf) return 'You';
  const label = String(person.displayName || '').trim();
  return isUsableFavoriteLabel(label) ? label : 'Favourite person';
}

async function ownedPerson(db, userId, clusterId) {
  return db.collection('person_clusters').findOne({
    userId,
    clusterId,
    status: { $nin: ['hidden', 'rejected', 'legacy'] },
    identityState: { $ne: 'unknown' },
  });
}

async function soloCandidates(db, userId, limit = 12) {
  const analyses = await db.collection('media_analysis').find({
    userId,
    analysisVersion: MAGIC_ANALYSIS_VERSION,
    faceCount: 1,
  }).sort({ updatedAt: -1, analyzedAt: -1 }).limit(Math.max(1, Math.min(30, limit * 3))).toArray();
  const mediaIds = [...new Set(analyses.map((row) => String(row.mediaId || '')).filter(Boolean))];
  if (!mediaIds.length) return [];
  const media = await db.collection('media').find({
    userId,
    id: { $in: mediaIds },
    trashed: { $ne: true },
    kind: 'photo',
  }).project({ id: 1, name: 1, createdAt: 1, provider: 1 }).toArray();
  const byId = new Map(media.map((item) => [String(item.id), item]));
  return mediaIds.map((id) => byId.get(id)).filter(Boolean).slice(0, limit).map((item) => ({
    mediaId: item.id,
    name: String(item.name || 'Solo photo').slice(0, 120),
    createdAt: item.createdAt || null,
  }));
}

async function readState({ db, user, request }) {
  const planId = entitlementForUser(user, request).planId || 'free';
  const limit = favoritePeopleLimitForPlan(planId);
  const [activation, account] = await Promise.all([
    db.collection('magic_library_activation').findOne({ userId: user.id }),
    db.collection('users').findOne({ id: user.id }, { projection: { cloudFaceRecognitionConsent: 1, faceProcessingConsent: 1 } }),
  ]);
  const stored = normalizeFavoritePeople(activation?.recognitionFavorites || []);
  const selectedIds = stored.slice(0, limit);
  const [people, enrollments, candidates] = await Promise.all([
    selectedIds.length ? db.collection('person_clusters').find({ userId: user.id, clusterId: { $in: selectedIds } }).toArray() : [],
    selectedIds.length ? db.collection('favorite_people_recognition').find({ userId: user.id, clusterId: { $in: selectedIds } }).toArray() : [],
    limit > 0 ? soloCandidates(db, user.id) : [],
  ]);
  const personById = new Map(people.map((person) => [String(person.clusterId), person]));
  const enrollmentById = new Map(enrollments.map((row) => [String(row.clusterId), row]));
  return {
    planId,
    limit,
    generation: favoriteGeneration(activation || {}),
    selected: selectedIds.map((clusterId) => {
      const person = personById.get(clusterId) || {};
      const enrollment = enrollmentById.get(clusterId);
      return {
        clusterId,
        displayName: safePersonLabel(person),
        isSelf: Boolean(person.isSelf),
        representativeMediaId: person.representativeMediaId || enrollment?.referenceMediaId || null,
        representativeFaceBox: person.representativeFaceBox || enrollment?.referenceFaceBox || null,
        enrolled: Boolean(enrollment?.awsUserId && enrollment?.faceIds?.length),
        enrolledAt: enrollment?.enrolledAt || null,
      };
    }),
    cloudReady: cloudRolloutReady(account || {}),
    consentGranted: hasFaceProcessingConsent(account || {}),
    candidates,
  };
}

async function addFavorite({ db, userId, clusterId, limit }) {
  const activation = await db.collection('magic_library_activation').findOne({ userId });
  const current = normalizeFavoritePeople(activation?.recognitionFavorites || []);
  if (current.includes(clusterId)) return { changed: false, favorites: current, generation: favoriteGeneration(activation || {}) };
  if (current.length >= limit) {
    const error = new Error(`Your plan supports ${limit} Favourite People for automatic recognition.`);
    error.code = 'favorite_people_limit';
    error.status = 403;
    throw error;
  }
  const next = [...current, clusterId];
  const generation = favoriteGeneration(activation || {}) + 1;
  await db.collection('magic_library_activation').updateOne(
    { userId },
    {
      $set: { recognitionFavorites: next, recognitionFavoritesGeneration: generation, updatedAt: new Date() },
      $setOnInsert: { active: [], createdAt: new Date() },
    },
    { upsert: true },
  );
  return { changed: true, favorites: next, generation };
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  return NextResponse.json(await readState({ db, user, request }));
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const planId = entitlementForUser(user, request).planId || 'free';
  const limit = favoritePeopleLimitForPlan(planId);
  if (limit <= 0) {
    return NextResponse.json({
      error: 'Automatic Favourite People recognition is available on paid plans. Local face detection remains available without it.',
      code: 'favorite_people_plan_required',
    }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || 'select').trim().toLowerCase();
  try {
    if (action === 'select') {
      const clusterId = String(body.clusterId || '').trim();
      if (!clusterId) return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
      const person = await ownedPerson(db, user.id, clusterId);
      if (!person) return NextResponse.json({ error: 'Choose a confirmed person from your Library.' }, { status: 404 });
      if (!person.isSelf && !isUsableFavoriteLabel(person.displayName)) {
        return NextResponse.json({ error: 'Name this person before adding them to Favourite People.' }, { status: 409 });
      }
      await addFavorite({ db, userId: user.id, clusterId, limit });
      return NextResponse.json({ ok: true, ...(await readState({ db, user, request })) });
    }

    if (action === 'enroll') {
      const mediaId = String(body.mediaId || '').trim();
      const requestedClusterId = String(body.clusterId || '').trim();
      const displayName = String(body.displayName || '').trim().slice(0, 80);
      if (!mediaId) return NextResponse.json({ error: 'Choose a solo reference photo.' }, { status: 400 });
      if (!requestedClusterId && !isUsableFavoriteLabel(displayName)) {
        return NextResponse.json({ error: 'Give this Favourite Person a name or relationship label.' }, { status: 400 });
      }

      const account = await db.collection('users').findOne({ id: user.id }, { projection: { cloudFaceRecognitionConsent: 1, faceProcessingConsent: 1 } });
      if (!cloudRolloutReady(account || {})) {
        return NextResponse.json({
          error: hasFaceProcessingConsent(account || {})
            ? 'Favourite People cloud matching is still held closed by launch safety checks.'
            : 'Enable Favourite People recognition in Privacy & security before enrolling a cloud reference.',
          code: hasFaceProcessingConsent(account || {}) ? 'people_rollout_disabled' : 'face_processing_consent_required',
        }, { status: 409 });
      }

      let clusterId = requestedClusterId;
      if (clusterId) {
        const person = await ownedPerson(db, user.id, clusterId);
        if (!person) return NextResponse.json({ error: 'Favourite person not found.' }, { status: 404 });
      } else {
        clusterId = crypto.randomUUID();
        const now = new Date();
        await db.collection('person_clusters').insertOne({
          userId: user.id,
          clusterId,
          indexVersion: PEOPLE_INTELLIGENCE_VERSION,
          displayName,
          identityState: 'person',
          verificationStatus: 'confirmed',
          status: 'active',
          representativeMediaId: mediaId,
          mediaIds: [mediaId],
          createdAt: now,
          updatedAt: now,
        });
      }

      await addFavorite({ db, userId: user.id, clusterId, limit });
      await enrollFavoritePerson({ db, userId: user.id, clusterId, mediaId });
      return NextResponse.json({ ok: true, ...(await readState({ db, user, request })) });
    }

    return NextResponse.json({ error: 'Unsupported Favourite People action.' }, { status: 400 });
  } catch (error) {
    console.error('[favorite-people] selection failed', error?.code || error?.name, error?.message);
    const status = Number(error?.status || (error?.code === 'face_processing_consent_required' ? 409 : 503));
    return NextResponse.json({ error: error?.message || 'Favourite People could not be updated.', code: error?.code || 'favorite_people_update_failed' }, { status });
  }
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const body = await request.json().catch(() => ({}));
  const clusterId = String(body.clusterId || '').trim();
  if (!clusterId) return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });

  try {
    await removeFavoriteEnrollment({ db, userId: user.id, clusterId });
    const activation = await db.collection('magic_library_activation').findOne({ userId: user.id });
    const current = normalizeFavoritePeople(activation?.recognitionFavorites || []);
    const next = current.filter((value) => value !== clusterId);
    const generation = favoriteGeneration(activation || {}) + (next.length === current.length ? 0 : 1);
    if (next.length !== current.length) {
      await db.collection('magic_library_activation').updateOne(
        { userId: user.id },
        { $set: { recognitionFavorites: next, recognitionFavoritesGeneration: generation, updatedAt: new Date() } },
      );
    }
    await finalizeFavoriteRemoval({ db, userId: user.id, clusterId, generation });
    return NextResponse.json({ ok: true, ...(await readState({ db, user, request })) });
  } catch (error) {
    console.error('[favorite-people] removal failed', error?.name, error?.message);
    return NextResponse.json({
      error: 'SnapNext could not verify removal of this Favourite Person from cloud recognition yet. Please retry.',
      code: 'favorite_people_removal_failed',
    }, { status: 503 });
  }
}
