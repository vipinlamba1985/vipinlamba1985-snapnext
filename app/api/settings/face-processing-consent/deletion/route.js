import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import {
  createFaceDeletionRequest,
  processFaceDeletionForUser,
} from '@/lib/face-deletion-worker.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function publicRequest(row) {
  if (!row) return { status: 'none', generation: 0, attempts: 0 };
  return {
    status: row.status || 'none',
    stage: row.stage || null,
    generation: Number(row.generation || 0),
    attempts: Number(row.attempts || 0),
    requestedAt: row.requestedAt || null,
    verifiedAt: row.verifiedAt || null,
    failedAt: row.failedAt || null,
    nextRetryAt: row.nextRetryAt || null,
    lastError: row.lastError || null,
    lastErrorCode: row.lastErrorCode || null,
  };
}

async function load(db, userId) {
  return db.collection('face_deletion_requests').findOne({ userId });
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  return NextResponse.json(publicRequest(await load(db, user.id)));
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  try {
    const created = await createFaceDeletionRequest({ db, userId: user.id, reason: 'user_requested' });
    if (created.failed) {
      return NextResponse.json({
        error: 'The previous deletion attempt needs retry. Retry the existing request instead of creating a new generation.',
        code: 'face_deletion_needs_retry',
        deletion: publicRequest(created.request),
      }, { status: 409 });
    }
    if (created.alreadyVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true, deletion: publicRequest(created.request) });
    }

    // Immediate server-owned attempt. If this invocation is interrupted, the
    // durable request remains recoverable by the recovery cron or explicit retry.
    await processFaceDeletionForUser({ db, userId: user.id });
    const latest = await load(db, user.id);
    return NextResponse.json({ ok: latest?.status === 'verified_deleted', deletion: publicRequest(latest) });
  } catch (error) {
    if (error?.code === 'cloud_face_consent_must_be_revoked') {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error('[face-deletion] request failed', error);
    return NextResponse.json({ error: 'Face-data deletion could not be started.', code: error?.code || 'face_deletion_start_failed' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const current = await load(db, user.id);
  if (!current) return NextResponse.json({ error: 'No face-data deletion request exists.', code: 'face_deletion_not_found' }, { status: 404 });
  if (current.status === 'verified_deleted') return NextResponse.json({ ok: true, alreadyVerified: true, deletion: publicRequest(current) });

  await processFaceDeletionForUser({ db, userId: user.id });
  const latest = await load(db, user.id);
  return NextResponse.json({ ok: latest?.status === 'verified_deleted', deletion: publicRequest(latest) });
}
