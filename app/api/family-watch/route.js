import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { distributedRateLimit } from '@/lib/distributed-rate-limit';
import {
  createFamilyWatchId,
  createFamilyWatchPairCode,
  createFamilyWatchSecret,
  createFamilyWatchVerificationCode,
  familyWatchPairExpiresAt,
  familyWatchSecretMatches,
  familyWatchSessionExpiresAt,
  hashFamilyWatchSecret,
  normalizeFamilyWatchMediaIds,
  publicFamilyWatchControllerState,
  safeFamilyWatchTitle,
} from '@/lib/family-watch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
let indexPromise;

function json(payload, status = 200, headers = {}) {
  return NextResponse.json(payload, { status, headers: { ...NO_STORE, ...headers } });
}

function validId(value) {
  return ID_PATTERN.test(String(value || '')) ? String(value) : null;
}

async function ensureIndexes(db) {
  if (!indexPromise) {
    const collection = db.collection('family_watch_sessions');
    indexPromise = Promise.all([
      collection.createIndex({ id: 1 }, { unique: true }),
      collection.createIndex({ pairCode: 1 }, { unique: true }),
      collection.createIndex({ cleanupAt: 1 }, { expireAfterSeconds: 0 }),
      collection.createIndex({ userId: 1, status: 1, createdAt: -1 }),
    ]).catch((error) => {
      indexPromise = undefined;
      console.warn('[family-watch] Index creation warning:', error?.message);
    });
  }
  await indexPromise;
}

async function limitUser(userId) {
  const result = await distributedRateLimit({ key: `family-watch:${userId}`, limit: 40, windowMs: 60_000 });
  if (result.allowed) return null;
  return json(
    { error: { code: 'rate_limited', message: 'Too many Watch together actions. Please try again shortly.' } },
    429,
    { 'Retry-After': String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))) },
  );
}

async function bodyOf(request) {
  try { return await request.json(); } catch { return {}; }
}

async function loadOwnedMedia(db, userId, mediaIds) {
  const docs = await db.collection('media').find({
    userId,
    id: { $in: mediaIds },
    trashed: { $ne: true },
    kind: { $in: ['photo', 'video'] },
  }).toArray();
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return mediaIds.map((id) => byId.get(id)).filter(Boolean);
}

function sessionExpired(session, now = new Date()) {
  if (!session) return true;
  const deadline = session.status === 'pending' || session.status === 'claimed' ? session.claimExpiresAt : session.expiresAt;
  return !deadline || new Date(deadline).getTime() <= now.getTime();
}

async function expireSession(collection, session, now = new Date()) {
  if (!session || ['expired', 'ended'].includes(session.status) || !sessionExpired(session, now)) return session;
  await collection.updateOne(
    { id: session.id, userId: session.userId, status: session.status },
    { $set: { status: 'expired', expiredAt: now, updatedAt: now }, $push: { events: { type: 'expired', at: now } } },
  );
  return { ...session, status: 'expired', expiredAt: now, updatedAt: now };
}

async function createSession(collection, userId, mediaIds, title, now) {
  const creatorSecret = createFamilyWatchSecret();
  const claimExpiresAt = familyWatchPairExpiresAt(now);
  const cleanupAt = new Date(familyWatchSessionExpiresAt(now).getTime() + 5 * 60 * 1000);

  await collection.updateMany(
    { userId, status: { $in: ['pending', 'claimed', 'approved'] } },
    { $set: { status: 'ended', endedAt: now, updatedAt: now }, $push: { events: { type: 'superseded', at: now } } },
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const session = {
      id: createFamilyWatchId(),
      pairCode: createFamilyWatchPairCode(),
      verificationCode: createFamilyWatchVerificationCode(),
      creatorSecretHash: hashFamilyWatchSecret(creatorSecret),
      userId,
      title,
      mediaIds,
      status: 'pending',
      playback: { index: 0, playing: true, revision: 0 },
      createdAt: now,
      updatedAt: now,
      claimExpiresAt,
      expiresAt: claimExpiresAt,
      cleanupAt,
      events: [{ type: 'created', at: now }],
    };
    try {
      await collection.insertOne(session);
      return { session, creatorSecret };
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  throw new Error('Could not allocate a unique family watch code.');
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: { code: 'unauthorized', message: 'Please sign in again.' } }, 401);
  const id = validId(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: { code: 'invalid_session', message: 'Watch session is invalid.' } }, 400);

  const db = await getDb();
  await ensureIndexes(db);
  const collection = db.collection('family_watch_sessions');
  let session = await collection.findOne({ id, userId: user.id });
  if (!session) return json({ error: { code: 'not_found', message: 'Watch session was not found.' } }, 404);
  session = await expireSession(collection, session);
  return json({ session: publicFamilyWatchControllerState(session) });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: { code: 'unauthorized', message: 'Please sign in again.' } }, 401);
  const limited = await limitUser(user.id);
  if (limited) return limited;

  const body = await bodyOf(request);
  const action = String(body?.action || 'create').toLowerCase();
  const now = new Date();
  const db = await getDb();
  await ensureIndexes(db);
  const collection = db.collection('family_watch_sessions');

  if (action === 'create') {
    const requestedIds = normalizeFamilyWatchMediaIds(body?.mediaIds);
    if (!requestedIds.length) return json({ error: { code: 'no_media', message: 'Choose at least one photo or video to watch.' } }, 400);
    const owned = await loadOwnedMedia(db, user.id, requestedIds);
    const mediaIds = owned.map((doc) => doc.id);
    if (!mediaIds.length) return json({ error: { code: 'no_owned_media', message: 'No available photos or videos were found for this story.' } }, 404);
    const { session, creatorSecret } = await createSession(collection, user.id, mediaIds, safeFamilyWatchTitle(body?.title), now);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '');
    return json({ session: publicFamilyWatchControllerState(session), creatorSecret, watchUrl: `${appUrl}/watch` }, 201);
  }

  const id = validId(body?.id);
  if (!id) return json({ error: { code: 'invalid_session', message: 'Watch session is invalid.' } }, 400);
  let session = await collection.findOne({ id, userId: user.id });
  if (!session) return json({ error: { code: 'not_found', message: 'Watch session was not found.' } }, 404);
  session = await expireSession(collection, session, now);

  if (!familyWatchSecretMatches(body?.creatorSecret, session.creatorSecretHash)) {
    return json({ error: { code: 'controller_proof_required', message: 'Use the device that started Watch together.' } }, 403);
  }

  if (action === 'approve') {
    if (session.status === 'approved') return json({ session: publicFamilyWatchControllerState(session) });
    if (session.status !== 'claimed' || sessionExpired(session, now)) {
      return json({ error: { code: 'not_ready', message: 'Wait for the TV to enter the pairing code, then try again.' } }, 409);
    }
    const expiresAt = familyWatchSessionExpiresAt(now);
    const updated = await collection.findOneAndUpdate(
      { id, userId: user.id, status: 'claimed', claimExpiresAt: { $gt: now } },
      {
        $set: { status: 'approved', approvedAt: now, expiresAt, cleanupAt: new Date(expiresAt.getTime() + 5 * 60 * 1000), updatedAt: now },
        $push: { events: { type: 'approved', at: now } },
      },
      { returnDocument: 'after' },
    );
    return json({ session: publicFamilyWatchControllerState(updated?.value || updated) });
  }

  if (action === 'end') {
    if (['ended', 'expired'].includes(session.status)) return json({ session: publicFamilyWatchControllerState(session) });
    const updated = await collection.findOneAndUpdate(
      { id, userId: user.id, status: { $in: ['pending', 'claimed', 'approved'] } },
      { $set: { status: 'ended', endedAt: now, updatedAt: now }, $push: { events: { type: 'ended', at: now } } },
      { returnDocument: 'after' },
    );
    return json({ session: publicFamilyWatchControllerState(updated?.value || updated || session) });
  }

  if (!['play', 'pause', 'next', 'previous'].includes(action)) {
    return json({ error: { code: 'invalid_action', message: 'Unsupported Watch together action.' } }, 400);
  }
  if (session.status !== 'approved' || sessionExpired(session, now)) {
    return json({ error: { code: 'not_active', message: 'This Watch together session is not active.' } }, 409);
  }

  const count = session.mediaIds?.length || 0;
  const current = Math.min(Math.max(Number(session.playback?.index || 0), 0), Math.max(0, count - 1));
  let nextIndex = current;
  let playing = session.playback?.playing !== false;
  if (action === 'play') playing = true;
  if (action === 'pause') playing = false;
  if (action === 'next' && count) nextIndex = (current + 1) % count;
  if (action === 'previous' && count) nextIndex = (current - 1 + count) % count;

  const updated = await collection.findOneAndUpdate(
    { id, userId: user.id, status: 'approved', expiresAt: { $gt: now } },
    {
      $set: { 'playback.index': nextIndex, 'playback.playing': playing, updatedAt: now },
      $inc: { 'playback.revision': 1 },
    },
    { returnDocument: 'after' },
  );
  return json({ session: publicFamilyWatchControllerState(updated?.value || updated) });
}
