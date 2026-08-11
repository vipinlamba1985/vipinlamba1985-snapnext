import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { MediaAnalysisValidationError, normalizeMediaAnalysisPayload } from '@/lib/intelligence/media-analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RETRY_BASE_MS = 5 * 60 * 1000;
const RETRY_MAX_MS = 24 * 60 * 60 * 1000;

function clean(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

function retryDelayMs(attempt) {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.max(0, attempt - 1)));
}

export async function GET(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = await getDb();
  const media = await db.collection('media').findOne({ id, userId: user.id, trashed: { $ne: true } }, { projection: { id: 1 } });
  if (!media) return NextResponse.json({ error: 'Memory not found' }, { status: 404 });

  const analysis = await db.collection('media_analysis').findOne({ mediaId: id, userId: user.id });
  if (!analysis) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  return NextResponse.json({ analysis: clean(analysis) });
}

export async function POST(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = await getDb();
  const media = await db.collection('media').findOne(
    { id, userId: user.id, trashed: { $ne: true } },
    { projection: { id: 1, kind: 1, hash: 1 } },
  );
  if (!media) return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
  if (media.kind !== 'photo') return NextResponse.json({ error: 'Local image analysis is currently supported for photos only.' }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  let normalized;
  try {
    normalized = normalizeMediaAnalysisPayload(body);
  } catch (error) {
    if (error instanceof MediaAnalysisValidationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    throw error;
  }

  const now = new Date();
  await db.collection('media_analysis').updateOne(
    { mediaId: id, userId: user.id },
    {
      $set: {
        ...normalized,
        mediaId: id,
        userId: user.id,
        sourceHash: media.hash || null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  // Mirror only the version/timestamp needed for the bounded missing-analysis
  // sweep. The full local result stays in media_analysis as its source of truth.
  await db.collection('media').updateOne(
    { id, userId: user.id, trashed: { $ne: true } },
    {
      $set: {
        magicAnalysisVersion: normalized.analysisVersion,
        magicAnalysisUpdatedAt: now,
      },
      $unset: {
        magicAnalysisFailureCount: '',
        magicAnalysisLastError: '',
        magicAnalysisRetryAt: '',
      },
    },
  );

  // A fresh local result makes a previously deferred People item eligible for
  // another policy check. It never forces a Rekognition call by itself.
  await db.collection('media').updateOne(
    {
      id,
      userId: user.id,
      'peopleIntelligence.status': { $in: ['awaiting_analysis', 'face_gate_disabled', 'face_processing_disabled'] },
    },
    {
      $set: {
        'peopleIntelligence.status': 'queued',
        'peopleIntelligence.gateUpdatedAt': now,
      },
      $unset: { 'peopleIntelligence.reason': '' },
    },
  );

  const analysis = await db.collection('media_analysis').findOne({ mediaId: id, userId: user.id });
  return NextResponse.json({ ok: true, analysis: clean(analysis) });
}

// Local-analysis failures are not terminal. Record bounded exponential backoff
// so one unsupported/corrupt photo cannot permanently starve the backlog.
export async function PATCH(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = await getDb();
  const media = await db.collection('media').findOne(
    { id, userId: user.id, trashed: { $ne: true }, kind: 'photo' },
    { projection: { id: 1, magicAnalysisFailureCount: 1 } },
  );
  if (!media) return NextResponse.json({ error: 'Memory not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const nextAttempt = Math.min(20, Math.max(0, Number(media.magicAnalysisFailureCount || 0)) + 1);
  const retryAt = new Date(Date.now() + retryDelayMs(nextAttempt));
  const message = String(body?.error || 'local_face_analysis_failed').slice(0, 240);

  await db.collection('media').updateOne(
    { id, userId: user.id, trashed: { $ne: true } },
    {
      $set: {
        magicAnalysisFailureCount: nextAttempt,
        magicAnalysisLastError: message,
        magicAnalysisRetryAt: retryAt,
      },
    },
  );

  return NextResponse.json({ ok: true, attempt: nextAttempt, retryAt });
}
