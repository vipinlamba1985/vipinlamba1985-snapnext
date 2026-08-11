import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { entitlementForUser } from '@/lib/entitlements';
import { PEOPLE_INTELLIGENCE_VERSION } from '@/lib/people-intelligence';
import {
  FAVORITE_RECOGNITION_SCOPE,
  FAVORITE_TERMINAL_STATUSES,
  rebuildFavoritePeopleRecognition,
} from '@/lib/favorite-people-recognition.server';
import { favoriteGeneration, favoritePeopleLimitForPlan, normalizeFavoritePeople } from '@/lib/favorite-people';
import { PEOPLE_COST_POLICY, estimatePhotoRunCost } from '@/lib/people-rekognition-capabilities';
import { countPendingGroupPhotoCleanup } from '@/lib/people-group-photo-reconciliation.server';
import { intelligenceConfig } from '@/lib/intelligence/config';
import { hasFaceProcessingConsent } from '@/lib/intelligence/face-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const baseQuery = (userId) => ({ userId, trashed: { $ne: true }, kind: 'photo' });

function pendingQuery(userId, generation) {
  return {
    ...baseQuery(userId),
    $or: [
      { 'peopleIntelligence.recognitionScope': { $ne: FAVORITE_RECOGNITION_SCOPE } },
      { 'peopleIntelligence.status': { $nin: [...FAVORITE_TERMINAL_STATUSES, 'failed'] } },
      {
        'peopleIntelligence.status': { $in: ['completed', 'no_favorite_match'] },
        'peopleIntelligence.favoriteGeneration': { $ne: generation },
      },
    ],
  };
}

async function getStatus(db, userId) {
  const activation = await db.collection('magic_library_activation').findOne({ userId });
  const generation = favoriteGeneration(activation || {});
  const selectedFavorites = normalizeFavoritePeople(activation?.recognitionFavorites || []).length;
  const base = baseQuery(userId);
  const [total, remaining, failed, withMatches, noMatches, noFaces, skipped, groupPhotos, groupPhotoCleanupPending] = await Promise.all([
    db.collection('media').countDocuments(base),
    db.collection('media').countDocuments(pendingQuery(userId, generation)),
    db.collection('media').countDocuments({ ...base, 'peopleIntelligence.recognitionScope': FAVORITE_RECOGNITION_SCOPE, 'peopleIntelligence.status': 'failed' }),
    db.collection('media').countDocuments({ ...base, 'peopleIntelligence.recognitionScope': FAVORITE_RECOGNITION_SCOPE, 'peopleIntelligence.status': 'completed', 'peopleIntelligence.clusterIds.0': { $exists: true } }),
    db.collection('media').countDocuments({ ...base, 'peopleIntelligence.recognitionScope': FAVORITE_RECOGNITION_SCOPE, 'peopleIntelligence.status': 'no_favorite_match' }),
    db.collection('media').countDocuments({ ...base, 'peopleIntelligence.recognitionScope': FAVORITE_RECOGNITION_SCOPE, 'peopleIntelligence.status': 'no_faces' }),
    db.collection('media').countDocuments({ ...base, 'peopleIntelligence.recognitionScope': FAVORITE_RECOGNITION_SCOPE, 'peopleIntelligence.status': 'skipped' }),
    db.collection('media').countDocuments({ ...base, 'peopleIntelligence.recognitionScope': FAVORITE_RECOGNITION_SCOPE, 'peopleIntelligence.status': 'group_photo' }),
    countPendingGroupPhotoCleanup({ db, userId }),
  ]);
  const checked = withMatches + noMatches + noFaces + skipped + groupPhotos;
  return {
    version: PEOPLE_INTELLIGENCE_VERSION,
    recognitionMode: FAVORITE_RECOGNITION_SCOPE,
    favoriteGeneration: generation,
    selectedFavorites,
    total,
    completed: checked,
    checked,
    withMatches,
    noMatches,
    noFaces,
    skipped,
    groupPhotos,
    groupPhotoCleanupPending,
    remaining,
    failed,
    needsMigration: remaining > 0 || failed > 0,
  };
}

function publicError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  if (name === 'AccessDeniedException' || /not authorized to perform|no identity-based policy allows/i.test(message)) return { status: 503, code: 'people_engine_permission_missing', error: 'Favourite People is connected, but AWS permission is not enabled yet.' };
  if (error?.code === 'people_engine_not_configured') return { status: 503, code: 'people_engine_not_configured', error: 'Favourite People is not configured for this environment yet.' };
  return { status: 503, code: error?.code || name || 'favorite_people_scan_failed', error: 'Favourite People could not finish this scan. Please try again.' };
}

async function processingBlock(db, user, request) {
  const config = intelligenceConfig();
  if (!(config.magicSorterEnabled && config.localFaceGateEnabled && config.faceProcessingEnabled)) {
    return { status: 409, code: 'people_rollout_disabled', error: 'Favourite People recognition is not enabled for this environment yet.' };
  }
  const planId = entitlementForUser(user, request).planId || 'free';
  const favoriteLimit = favoritePeopleLimitForPlan(planId);
  if (favoriteLimit <= 0) {
    return { status: 403, code: 'favorite_people_plan_required', error: 'Automatic Favourite People recognition is available on paid plans.' };
  }
  const activation = await db.collection('magic_library_activation').findOne({ userId: user.id });
  const allSelected = normalizeFavoritePeople(activation?.recognitionFavorites || []);
  const selected = allSelected.slice(0, favoriteLimit);
  if (allSelected.length > selected.length) {
    await db.collection('magic_library_activation').updateOne(
      { userId: user.id },
      {
        $set: {
          recognitionFavorites: selected,
          recognitionFavoritesGeneration: favoriteGeneration(activation || {}) + 1,
          updatedAt: new Date(),
        },
      },
    );
  }
  if (!selected.length) {
    return { status: 409, code: 'favorite_people_required', error: 'Choose at least one Favourite Person before cloud matching starts.' };
  }
  const enrolled = await db.collection('favorite_people_recognition').countDocuments({
    userId: user.id,
    clusterId: { $in: selected },
    faceIds: { $exists: true, $ne: [] },
  });
  if (!enrolled) {
    return { status: 409, code: 'favorite_reference_required', error: 'Add a clear solo reference photo for a Favourite Person before cloud matching starts.' };
  }
  if (!config.consentRequired) return null;
  const account = await db.collection('users').findOne({ id: user.id }, { projection: { cloudFaceRecognitionConsent: 1, faceProcessingConsent: 1 } });
  if (!hasFaceProcessingConsent(account || {})) {
    return { status: 409, code: 'face_processing_consent_required', error: 'Enable Favourite People recognition in Privacy & security before organizing photos by person.' };
  }
  return null;
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const planId = entitlementForUser(user, request).planId || 'free';
  return NextResponse.json({ ...(await getStatus(db, user.id)), favoriteLimit: favoritePeopleLimitForPlan(planId) });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const blocked = await processingBlock(db, user, request);
  if (blocked) return NextResponse.json({ error: blocked.error, code: blocked.code }, { status: blocked.status });

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(PEOPLE_COST_POLICY.maxPhotosPerBatch, Number(body.limit || 12)));
  const estimatedMaxCost = estimatePhotoRunCost({ photos: limit, estimatedFaces: limit * 2 });
  if (estimatedMaxCost > PEOPLE_COST_POLICY.maxEstimatedUsdPerBatch) {
    return NextResponse.json({ error: 'This batch is larger than the configured cost safety limit.', code: 'people_cost_guard_blocked' }, { status: 429 });
  }

  try {
    if (body.retryFailed === true) {
      await db.collection('media').updateMany(
        { userId: user.id, 'peopleIntelligence.recognitionScope': FAVORITE_RECOGNITION_SCOPE, 'peopleIntelligence.status': 'failed' },
        { $set: { 'peopleIntelligence.status': 'queued', 'peopleIntelligence.retryRequestedAt': new Date() }, $unset: { 'peopleIntelligence.error': '' } },
      );
    }
    const result = await rebuildFavoritePeopleRecognition({ db, userId: user.id, limit, retryFailed: body.retryFailed === true });
    return NextResponse.json({ ok: true, ...result, migration: await getStatus(db, user.id), estimatedMaxCost });
  } catch (error) {
    console.error('[favorite-people] reindex failed', error?.name, error?.message);
    const safe = publicError(error);
    return NextResponse.json({ error: safe.error, code: safe.code }, { status: safe.status });
  }
}
