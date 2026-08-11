import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { distributedRateLimit } from '@/lib/distributed-rate-limit';
import {
  COMPUTER_HANDOFF_ACTIVE_STATUSES,
  createCreatorSecret,
  createOpaqueHandoffId,
  createPairCode,
  createVerificationCode,
  creatorSecretMatches,
  handoffExpiresAt,
  hashCreatorSecret,
  isHandoffExpired,
  normalizePairCode,
  publicHandoffState,
} from '@/lib/computer-handoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = COMPUTER_HANDOFF_ACTIVE_STATUSES;
const HANDOFF_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };
let indexPromise;

function json(payload, status = 200, extraHeaders = {}) {
  return NextResponse.json(payload, {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders },
  });
}

async function ensureIndexes(db) {
  if (!indexPromise) {
    const collection = db.collection('computer_handoff_sessions');
    indexPromise = Promise.all([
      collection.createIndex({ id: 1 }, { unique: true }),
      collection.createIndex({ pairCode: 1 }, { unique: true }),
      collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      collection.createIndex({ userId: 1, status: 1, createdAt: -1 }),
    ]).catch((error) => {
      indexPromise = undefined;
      console.warn('[computer-handoff] Index creation warning:', error?.message);
    });
  }
  await indexPromise;
}

async function enforceUserRateLimit(userId) {
  const result = await distributedRateLimit({
    key: `computer-handoff:${userId}`,
    limit: 24,
    windowMs: 60_000,
  });
  if (result.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return json(
    { error: { code: 'rate_limited', message: 'Too many pairing attempts. Please try again shortly.' } },
    429,
    { 'Retry-After': String(retryAfter) },
  );
}

function validHandoffId(value) {
  return HANDOFF_ID_PATTERN.test(String(value || '')) ? String(value) : null;
}

async function expireIfNeeded(collection, session, now = new Date()) {
  if (!session || !ACTIVE_STATUSES.includes(session.status) || !isHandoffExpired(session, now)) return session;
  await collection.updateOne(
    { id: session.id, userId: session.userId, status: { $in: ACTIVE_STATUSES } },
    {
      $set: { status: 'expired', updatedAt: now, expiredAt: now },
      $push: { events: { type: 'expired', at: now } },
    },
  );
  return { ...session, status: 'expired', updatedAt: now, expiredAt: now };
}

async function createSession(collection, userId, now) {
  const creatorSecret = createCreatorSecret();
  const expiresAt = handoffExpiresAt(now);

  await collection.updateMany(
    { userId, status: { $in: ACTIVE_STATUSES }, expiresAt: { $gt: now } },
    {
      $set: { status: 'cancelled', updatedAt: now, cancelledAt: now },
      $push: { events: { type: 'superseded', at: now } },
    },
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const session = {
      id: createOpaqueHandoffId(),
      pairCode: createPairCode(),
      verificationCode: createVerificationCode(),
      creatorSecretHash: hashCreatorSecret(creatorSecret),
      userId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt,
      events: [{ type: 'created', at: now }],
    };

    try {
      await collection.insertOne(session);
      return { session, creatorSecret };
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  throw new Error('Could not allocate a unique pairing code.');
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: { code: 'unauthorized', message: 'Please sign in again.' } }, 401);

  const id = validHandoffId(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: { code: 'invalid_handoff', message: 'Pairing session is invalid.' } }, 400);

  const db = await getDb();
  await ensureIndexes(db);
  const collection = db.collection('computer_handoff_sessions');
  let session = await collection.findOne({ id, userId: user.id });
  if (!session) return json({ error: { code: 'not_found', message: 'Pairing session was not found.' } }, 404);

  session = await expireIfNeeded(collection, session);
  return json({ session: publicHandoffState(session) });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: { code: 'unauthorized', message: 'Please sign in again.' } }, 401);

  const limited = await enforceUserRateLimit(user.id);
  if (limited) return limited;

  const body = await parseJson(request);
  const action = String(body?.action || 'create').toLowerCase();
  const now = new Date();
  const db = await getDb();
  await ensureIndexes(db);
  const collection = db.collection('computer_handoff_sessions');

  if (action === 'create') {
    const { session, creatorSecret } = await createSession(collection, user.id, now);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '');
    return json({
      session: publicHandoffState(session),
      creatorSecret,
      connectUrl: `${appUrl}/connect`,
    }, 201);
  }

  if (action === 'claim') {
    const pairCode = normalizePairCode(body?.pairCode);
    if (!pairCode) return json({ error: { code: 'invalid_pair_code', message: 'Enter the 8-character pairing code from your phone.' } }, 400);

    const updated = await collection.findOneAndUpdate(
      {
        pairCode,
        userId: user.id,
        status: 'pending',
        expiresAt: { $gt: now },
      },
      {
        $set: { status: 'claimed', claimedAt: now, updatedAt: now },
        $push: { events: { type: 'claimed', at: now } },
      },
      { returnDocument: 'after' },
    );
    const session = updated?.value || updated;
    if (!session) {
      return json({ error: { code: 'pair_code_unavailable', message: 'That pairing code is invalid, expired, or already in use.' } }, 404);
    }
    return json({ session: publicHandoffState(session) });
  }

  const id = validHandoffId(body?.id);
  if (!id) return json({ error: { code: 'invalid_handoff', message: 'Pairing session is invalid.' } }, 400);

  let session = await collection.findOne({ id, userId: user.id });
  if (!session) return json({ error: { code: 'not_found', message: 'Pairing session was not found.' } }, 404);
  session = await expireIfNeeded(collection, session, now);

  if (action === 'approve' || action === 'cancel') {
    if (!creatorSecretMatches(body?.creatorSecret, session.creatorSecretHash)) {
      return json({ error: { code: 'creator_proof_required', message: 'This pairing must be approved from the phone that started it.' } }, 403);
    }
  }

  if (action === 'approve') {
    if (session.status === 'approved' || session.status === 'consumed') {
      return json({ session: publicHandoffState(session) });
    }
    if (session.status !== 'claimed') {
      return json({ error: { code: 'not_ready', message: 'Wait for the computer to connect before approving.' } }, 409);
    }
    const updated = await collection.findOneAndUpdate(
      { id, userId: user.id, status: 'claimed', expiresAt: { $gt: now } },
      {
        $set: { status: 'approved', approvedAt: now, updatedAt: now },
        $push: { events: { type: 'approved', at: now } },
      },
      { returnDocument: 'after' },
    );
    return json({ session: publicHandoffState(updated?.value || updated) });
  }

  if (action === 'cancel') {
    if (session.status === 'cancelled' || session.status === 'expired' || session.status === 'consumed') {
      return json({ session: publicHandoffState(session) });
    }
    const updated = await collection.findOneAndUpdate(
      { id, userId: user.id, status: { $in: ACTIVE_STATUSES } },
      {
        $set: { status: 'cancelled', cancelledAt: now, updatedAt: now },
        $push: { events: { type: 'cancelled', at: now } },
      },
      { returnDocument: 'after' },
    );
    return json({ session: publicHandoffState(updated?.value || updated || session) });
  }

  if (action === 'consume') {
    if (session.status === 'consumed') {
      return json({ session: publicHandoffState(session), uploadPath: '/upload/discover?continued=computer' });
    }
    if (session.status !== 'approved') {
      return json({ error: { code: 'approval_required', message: 'Approve this computer on your phone first.' } }, 409);
    }
    const updated = await collection.findOneAndUpdate(
      { id, userId: user.id, status: 'approved', expiresAt: { $gt: now } },
      {
        $set: { status: 'consumed', consumedAt: now, updatedAt: now },
        $push: { events: { type: 'consumed', at: now } },
      },
      { returnDocument: 'after' },
    );
    const consumed = updated?.value || updated;
    if (!consumed) return json({ error: { code: 'handoff_conflict', message: 'This pairing session changed. Start a new pairing.' } }, 409);
    return json({ session: publicHandoffState(consumed), uploadPath: '/upload/discover?continued=computer' });
  }

  return json({ error: { code: 'invalid_action', message: 'Unsupported pairing action.' } }, 400);
}
