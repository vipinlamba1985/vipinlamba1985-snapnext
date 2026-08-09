import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import {
  CLOUD_FACE_RECOGNITION_CONSENT_VERSION,
  FACE_PROCESSING_CONSENT_VERSION,
  intelligenceConfig,
} from '@/lib/intelligence/config';
import { cloudFaceRecognitionConsent } from '@/lib/intelligence/face-gate';
import { deletionBlocksCloudRegrant } from '@/lib/face-deletion-worker.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rolloutAvailable() {
  const config = intelligenceConfig();
  return Boolean(config.magicSorterEnabled && config.localFaceGateEnabled && config.faceProcessingEnabled);
}

function publicState(user, deletionRequest) {
  const consent = cloudFaceRecognitionConsent(user || {});
  const deletionStatus = deletionRequest?.status || consent.deletionState || 'none';
  const activeDeletion = ['pending', 'processing', 'verifying'].includes(deletionStatus);
  return {
    available: rolloutAvailable(),
    version: CLOUD_FACE_RECOGNITION_CONSENT_VERSION,
    granted: consent.granted === true && !consent.revokedAt && !deletionBlocksCloudRegrant(deletionRequest),
    grantedAt: consent.grantedAt || null,
    revokedAt: consent.revokedAt || null,
    pendingDeletion: activeDeletion,
    deletionNeedsRetry: deletionStatus === 'failed',
    deletionVerified: deletionStatus === 'verified_deleted',
    deletionRequestedAt: deletionRequest?.requestedAt || consent.deletionRequestedAt || null,
    deletionStatus,
    deletionGeneration: Number(deletionRequest?.generation || 0),
    deletionAttempts: Number(deletionRequest?.attempts || 0),
    deletionLastError: deletionRequest?.lastError || null,
  };
}

async function loadState(db, userId) {
  const [user, deletionRequest] = await Promise.all([
    db.collection('users').findOne({ id: userId }, {
      projection: { cloudFaceRecognitionConsent: 1, faceProcessingConsent: 1 },
    }),
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
  if (deletionBlocksCloudRegrant(current.deletionRequest)) {
    return NextResponse.json({
      error: current.deletionRequest?.status === 'failed'
        ? 'Face-data deletion needs retry before People recognition can be enabled again.'
        : 'Face-data deletion is still in progress. People recognition can be enabled after verified deletion completes.',
      code: current.deletionRequest?.status === 'failed' ? 'face_deletion_needs_retry' : 'face_deletion_pending',
    }, { status: 409 });
  }

  const now = new Date();
  await db.collection('users').updateOne(
    { id: authUser.id },
    {
      $set: {
        cloudFaceRecognitionConsent: {
          granted: true,
          version: CLOUD_FACE_RECOGNITION_CONSENT_VERSION,
          grantedAt: now,
          revokedAt: null,
          deletionState: 'none',
          deletionRequestedAt: null,
        },
        // Transitional mirror for M0/M1 callers while M7 migrates every reader.
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

// M7 separates revoke from delete. Revoke immediately stops future cloud
// recognition but intentionally leaves existing remote recognition data intact
// until the user explicitly requests deletion through the deletion endpoint.
export async function DELETE(request) {
  const authUser = await getUserFromRequest(request);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const current = await loadState(db, authUser.id);
  const consent = cloudFaceRecognitionConsent(current.user || {});
  if (consent.granted !== true && consent.revokedAt) {
    return NextResponse.json({ ok: true, idempotent: true, ...publicState(current.user, current.deletionRequest) });
  }

  const now = new Date();
  await db.collection('users').updateOne(
    { id: authUser.id },
    {
      $set: {
        'cloudFaceRecognitionConsent.granted': false,
        'cloudFaceRecognitionConsent.version': CLOUD_FACE_RECOGNITION_CONSENT_VERSION,
        'cloudFaceRecognitionConsent.revokedAt': now,
        'cloudFaceRecognitionConsent.deletionState': 'not_requested',
        'faceProcessingConsent.granted': false,
        'faceProcessingConsent.version': FACE_PROCESSING_CONSENT_VERSION,
        'faceProcessingConsent.revokedAt': now,
        'faceProcessingConsent.deletionState': 'not_requested',
      },
    },
  );

  const next = await loadState(db, authUser.id);
  return NextResponse.json({ ok: true, deletionQueued: false, ...publicState(next.user, next.deletionRequest) });
}
