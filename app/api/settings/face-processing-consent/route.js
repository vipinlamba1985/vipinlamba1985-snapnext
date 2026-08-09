import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { FACE_PROCESSING_CONSENT_VERSION, intelligenceConfig } from '@/lib/intelligence/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rolloutAvailable() {
  const config = intelligenceConfig();
  return Boolean(config.magicSorterEnabled && config.localFaceGateEnabled && config.faceProcessingEnabled);
}

function publicState(user, deletionRequest) {
  const consent = user?.faceProcessingConsent || {};
  const pendingDeletion = ['pending', 'processing'].includes(deletionRequest?.status)
    || consent.deletionState === 'pending';
  return {
    available: rolloutAvailable(),
    version: FACE_PROCESSING_CONSENT_VERSION,
    granted: consent.granted === true && !consent.revokedAt && !pendingDeletion,
    grantedAt: consent.grantedAt || null,
    revokedAt: consent.revokedAt || null,
    pendingDeletion,
    deletionRequestedAt: deletionRequest?.requestedAt || consent.deletionRequestedAt || null,
    deletionStatus: deletionRequest?.status || consent.deletionState || 'none',
    deletionGeneration: Number(deletionRequest?.generation || 0),
  };
}

async function loadState(db, userId) {
  const [user, deletionRequest] = await Promise.all([
    db.collection('users').findOne({ id: userId }, { projection: { faceProcessingConsent: 1 } }),
    db.collection('face_deletion_requests').findOne({ userId }),
  ]);
  return { user, deletionRequest };
}

export async function GET(request) {
  const authUser = await getUserFromRequest(request);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const state = await loadState(db, authUser.id);
  return NextResponse.json(publicState(state.user, state.deletionRequest));
}

// Explicit grant. A dormant rollout is not exposed as enabled, and a previous
// deletion request is never silently cancelled by a new grant.
export async function POST(request) {
  const authUser = await getUserFromRequest(request);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!rolloutAvailable()) {
    return NextResponse.json({
      error: 'People recognition is not enabled for this environment yet.',
      code: 'people_rollout_disabled',
    }, { status: 409 });
  }

  const db = await getDb();
  const current = await loadState(db, authUser.id);
  if (['pending', 'processing'].includes(current.deletionRequest?.status)
      || current.user?.faceProcessingConsent?.deletionState === 'pending') {
    return NextResponse.json({
      error: 'Face-data deletion is still pending. People recognition can be enabled after verified deletion completes.',
      code: 'face_deletion_pending',
    }, { status: 409 });
  }

  const now = new Date();
  await db.collection('users').updateOne(
    { id: authUser.id },
    {
      $set: {
        faceProcessingConsent: {
          granted: true,
          version: FACE_PROCESSING_CONSENT_VERSION,
          grantedAt: now,
          revokedAt: null,
          deletionState: 'none',
          deletionRequestedAt: null,
        },
      },
    },
  );

  const next = await loadState(db, authUser.id);
  return NextResponse.json({ ok: true, ...publicState(next.user, next.deletionRequest) });
}

// Revoke means two things from the user's point of view: future People
// processing is denied immediately, and durable deletion work is owed. The
// generation increments on every revoke so M7 can reject a stale verification
// result if a newer deletion request arrived while a worker was running.
export async function DELETE(request) {
  const authUser = await getUserFromRequest(request);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const now = new Date();

  await db.collection('users').updateOne(
    { id: authUser.id },
    {
      $set: {
        'faceProcessingConsent.granted': false,
        'faceProcessingConsent.version': FACE_PROCESSING_CONSENT_VERSION,
        'faceProcessingConsent.revokedAt': now,
        'faceProcessingConsent.deletionState': 'pending',
        'faceProcessingConsent.deletionRequestedAt': now,
      },
    },
  );

  await db.collection('face_deletion_requests').updateOne(
    { userId: authUser.id },
    {
      $set: {
        status: 'pending',
        reason: 'consent_revoked',
        consentVersion: FACE_PROCESSING_CONSENT_VERSION,
        requestedAt: now,
        attempts: 0,
        lastError: null,
        verifiedAt: null,
        updatedAt: now,
      },
      $inc: { generation: 1 },
      $setOnInsert: { userId: authUser.id, createdAt: now },
    },
    { upsert: true },
  );

  const next = await loadState(db, authUser.id);
  return NextResponse.json({ ok: true, ...publicState(next.user, next.deletionRequest) });
}
