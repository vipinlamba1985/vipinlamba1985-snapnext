import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { FACE_PROCESSING_CONSENT_VERSION } from '@/lib/intelligence/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publicState(user, deletionRequest) {
  const consent = user?.faceProcessingConsent || {};
  const pendingDeletion = ['pending', 'processing'].includes(deletionRequest?.status)
    || consent.deletionState === 'pending';
  return {
    version: FACE_PROCESSING_CONSENT_VERSION,
    granted: consent.granted === true && !consent.revokedAt && !pendingDeletion,
    grantedAt: consent.grantedAt || null,
    revokedAt: consent.revokedAt || null,
    pendingDeletion,
    deletionRequestedAt: deletionRequest?.requestedAt || consent.deletionRequestedAt || null,
    deletionStatus: deletionRequest?.status || consent.deletionState || 'none',
  };
}

async function loadState(db, userId) {
  const [user, deletionRequest] = await Promise.all([
    db.collection('users').findOne({ id: userId }, { projection: { faceProcessingConsent: 1 } }),
    db.collection('face_deletion_requests').findOne(
      { userId, status: { $in: ['pending', 'processing'] } },
      { sort: { requestedAt: -1 } },
    ),
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

// Explicit grant. A previous deletion request is never silently cancelled by a
// new grant; verified deletion must finish first.
export async function POST(request) {
  const authUser = await getUserFromRequest(request);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

// Revoke means two things atomically from the user's point of view: future
// People processing is denied immediately, and durable deletion work is owed.
// M7 will drain and verify this queue; this endpoint never claims deletion is
// complete merely because the preference flipped.
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

  const existing = await db.collection('face_deletion_requests').findOne({
    userId: authUser.id,
    status: { $in: ['pending', 'processing'] },
  });
  if (!existing) {
    await db.collection('face_deletion_requests').insertOne({
      userId: authUser.id,
      status: 'pending',
      reason: 'consent_revoked',
      consentVersion: FACE_PROCESSING_CONSENT_VERSION,
      requestedAt: now,
      attempts: 0,
      lastError: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const next = await loadState(db, authUser.id);
  return NextResponse.json({ ok: true, ...publicState(next.user, next.deletionRequest) });
}
