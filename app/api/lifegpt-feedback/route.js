import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function text(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function list(value, maxItems = 20) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => text(item, 100)).filter(Boolean))].slice(0, maxItems);
}

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await request.json().catch(() => ({}));
    const responseId = text(body.responseId, 100);
    const rating = body.rating === 'helpful' ? 'helpful' : body.rating === 'incorrect' ? 'incorrect' : null;
    if (!responseId || !rating) return json({ error: 'Response ID and valid rating are required.' }, 400);

    const db = await getDb();
    const requestedSourceIds = list(body.sourceIds, 50);
    const ownedSources = requestedSourceIds.length
      ? await db.collection('media').find({ userId: user.id, id: { $in: requestedSourceIds } }).project({ id: 1 }).toArray()
      : [];
    const ownedSourceIds = ownedSources.map((item) => item.id);

    const feedback = {
      id: randomUUID(),
      userId: user.id,
      responseId,
      rating,
      query: text(body.query, 1200),
      reason: text(body.reason, 300),
      correction: text(body.correction, 1000),
      sourceIds: ownedSourceIds,
      createdAt: new Date(),
      status: rating === 'incorrect' ? 'needs_review' : 'recorded',
      appliedAutomatically: false,
    };

    await db.collection('lifegpt_feedback').updateOne(
      { userId: user.id, responseId },
      { $set: feedback },
      { upsert: true },
    );

    await db.collection('lifegpt_audits').updateOne(
      { userId: user.id, responseId },
      { $set: { feedback: rating, feedbackAt: new Date() } },
    ).catch(() => null);

    return json({
      ok: true,
      rating,
      message: rating === 'helpful'
        ? 'Thanks. This helps SnapNext measure retrieval quality.'
        : 'Thanks. Your correction was recorded for review and was not applied automatically.',
    });
  } catch (error) {
    console.error('[lifegpt-feedback] failed', error?.message);
    return json({ error: 'Could not save feedback right now.' }, 500);
  }
}
