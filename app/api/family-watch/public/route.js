import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { distributedRateLimit } from '@/lib/distributed-rate-limit';
import {
  createFamilyWatchSecret,
  familyWatchSecretMatches,
  formatFamilyWatchVerificationCode,
  hashFamilyWatchSecret,
  normalizeFamilyWatchPairCode,
} from '@/lib/family-watch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };
const ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;

function json(payload, status = 200, headers = {}) {
  return NextResponse.json(payload, { status, headers: { ...NO_STORE, ...headers } });
}

function validId(value) {
  return ID_PATTERN.test(String(value || '')) ? String(value) : null;
}

async function bodyOf(request) {
  try { return await request.json(); } catch { return {}; }
}

function clientKey(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}

async function limitViewer(request) {
  const result = await distributedRateLimit({ key: `family-watch-viewer:${clientKey(request)}`, limit: 120, windowMs: 60_000 });
  if (result.allowed) return null;
  return json(
    { error: { code: 'rate_limited', message: 'Too many TV pairing attempts. Please try again shortly.' } },
    429,
    { 'Retry-After': String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))) },
  );
}

function isExpired(session, now = new Date()) {
  const deadline = session?.status === 'pending' || session?.status === 'claimed' ? session?.claimExpiresAt : session?.expiresAt;
  return !deadline || new Date(deadline).getTime() <= now.getTime();
}

function viewerState(session) {
  return {
    id: session.id,
    status: session.status,
    title: session.title,
    itemCount: session.mediaIds?.length || 0,
    verificationCode: ['claimed', 'approved', 'ended'].includes(session.status)
      ? formatFamilyWatchVerificationCode(session.verificationCode)
      : null,
    playback: session.playback || { index: 0, playing: true, revision: 0 },
    expiresAt: session.expiresAt ? new Date(session.expiresAt).toISOString() : null,
    viewerReady: Boolean(session.viewerReadyAt),
  };
}

async function publicItems(db, session) {
  if (session.status !== 'approved' || isExpired(session)) return [];
  const docs = await db.collection('media').find({
    userId: session.userId,
    id: { $in: session.mediaIds || [] },
    trashed: { $ne: true },
    kind: { $in: ['photo', 'video'] },
  }).toArray();
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return (session.mediaIds || []).map((id, slot) => {
    const doc = byId.get(id);
    if (!doc) return null;
    return {
      slot,
      kind: doc.kind,
      name: String(doc.name || 'Memory').slice(0, 160),
      mime: String(doc.mime || ''),
      createdAt: doc.createdAt || null,
    };
  }).filter(Boolean);
}

export async function POST(request) {
  const limited = await limitViewer(request);
  if (limited) return limited;
  const body = await bodyOf(request);
  const action = String(body?.action || '').toLowerCase();
  const now = new Date();
  const db = await getDb();
  const collection = db.collection('family_watch_sessions');

  if (action === 'claim') {
    const pairCode = normalizeFamilyWatchPairCode(body?.pairCode);
    if (!pairCode) return json({ error: { code: 'invalid_pair_code', message: 'Enter the 8-character code shown on the phone.' } }, 400);

    const viewerSecret = createFamilyWatchSecret();
    const candidate = await collection.findOne({ pairCode, status: 'pending', claimExpiresAt: { $gt: now } });
    if (!candidate) return json({ error: { code: 'pair_code_unavailable', message: 'That code is invalid, expired, or already in use.' } }, 404);
    const mediaAccessTokens = (candidate.mediaIds || []).map(() => createFamilyWatchSecret());
    const mediaAccessHashes = mediaAccessTokens.map(hashFamilyWatchSecret);

    const updated = await collection.findOneAndUpdate(
      { id: candidate.id, status: 'pending', claimExpiresAt: { $gt: now } },
      {
        $set: {
          status: 'claimed',
          viewerSecretHash: hashFamilyWatchSecret(viewerSecret),
          mediaAccessHashes,
          claimedAt: now,
          updatedAt: now,
        },
        $push: { events: { type: 'viewer_claimed', at: now } },
      },
      { returnDocument: 'after' },
    );
    const session = updated?.value || updated;
    if (!session) return json({ error: { code: 'pairing_conflict', message: 'This family session was claimed on another screen.' } }, 409);
    return json({ session: viewerState(session), viewerSecret, mediaAccessTokens });
  }

  const id = validId(body?.id);
  if (!id) return json({ error: { code: 'invalid_session', message: 'Watch session is invalid.' } }, 400);
  const session = await collection.findOne({ id });
  if (!session || !familyWatchSecretMatches(body?.viewerSecret, session.viewerSecretHash)) {
    return json({ error: { code: 'viewer_proof_required', message: 'This TV session is no longer valid.' } }, 403);
  }

  if (isExpired(session, now) && !['expired', 'ended'].includes(session.status)) {
    await collection.updateOne(
      { id, status: session.status },
      { $set: { status: 'expired', expiredAt: now, updatedAt: now }, $push: { events: { type: 'expired', at: now } } },
    );
    session.status = 'expired';
  }

  if (action === 'ready') {
    if (session.status !== 'approved') return json({ session: viewerState(session), items: [] });
    if (!session.viewerReadyAt) {
      await collection.updateOne(
        { id, status: 'approved', viewerReadyAt: { $exists: false } },
        { $set: { viewerReadyAt: now, updatedAt: now }, $push: { events: { type: 'viewer_ready', at: now } } },
      );
      session.viewerReadyAt = now;
    }
    return json({ session: viewerState(session), items: await publicItems(db, session) });
  }

  if (action === 'advance') {
    if (session.status !== 'approved' || isExpired(session, now) || session.playback?.playing === false) {
      return json({ session: viewerState(session), items: await publicItems(db, session) });
    }
    const count = session.mediaIds?.length || 0;
    const current = Math.min(Math.max(Number(session.playback?.index || 0), 0), Math.max(0, count - 1));
    const nextIndex = count ? (current + 1) % count : 0;
    const updated = await collection.findOneAndUpdate(
      { id, status: 'approved', expiresAt: { $gt: now } },
      { $set: { 'playback.index': nextIndex, updatedAt: now }, $inc: { 'playback.revision': 1 } },
      { returnDocument: 'after' },
    );
    const next = updated?.value || updated || session;
    return json({ session: viewerState(next), items: await publicItems(db, next) });
  }

  if (action !== 'status') return json({ error: { code: 'invalid_action', message: 'Unsupported TV action.' } }, 400);
  return json({ session: viewerState(session), items: await publicItems(db, session) });
}
