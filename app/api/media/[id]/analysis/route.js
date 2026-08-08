import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { MediaAnalysisValidationError, normalizeMediaAnalysisPayload } from '@/lib/intelligence/media-analysis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
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
