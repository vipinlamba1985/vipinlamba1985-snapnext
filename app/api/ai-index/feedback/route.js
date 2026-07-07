export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { aiIndexAccess } from '@/lib/ai-index-access';

const EVENT_TYPES = new Set([
  'search_result_opened',
  'search_result_ignored',
  'person_corrected',
  'place_corrected',
  'task_accepted',
  'task_rejected',
  'caption_accepted',
  'caption_edited',
  'asset_favorited',
  'asset_hidden',
  'agent_answer_helpful',
  'agent_answer_wrong',
]);

function text(value, max = 500) {
  return String(value || '').trim().slice(0, max) || null;
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  const access = aiIndexAccess({ user, request });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = await request.json().catch(() => ({}));
  const eventType = text(body.eventType, 80);
  if (!EVENT_TYPES.has(eventType)) {
    return Response.json({ error: { code: 'invalid_feedback_type', message: 'Unsupported feedback event.' } }, { status: 400 });
  }

  const db = await getDb();
  const mediaId = text(body.mediaId, 120);
  if (mediaId) {
    const owned = await db.collection('media').findOne({ id: mediaId, userId: user.id }, { projection: { _id: 1 } });
    if (!owned) return Response.json({ error: { code: 'not_found', message: 'Saved asset not found.' } }, { status: 404 });
  }

  const now = new Date();
  const event = {
    id: uuidv4(),
    userId: user.id,
    mediaId,
    eventType,
    query: text(body.query),
    expected: text(body.expected),
    predicted: text(body.predicted),
    source: text(body.source, 80) || 'snapnext_ui',
    consentLevel: 'personal_learning_only',
    modelVersion: text(body.modelVersion, 120),
    createdAt: now,
  };
  await db.collection('ai_feedback_events').insertOne(event);

  return Response.json({ ok: true, feedbackId: event.id, consentLevel: event.consentLevel });
}
