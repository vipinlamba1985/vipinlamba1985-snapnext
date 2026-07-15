import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { preflightAiRequest } from '@/lib/ai-router';

export const runtime = 'nodejs';

const ACTIONS = {
  'hd-upscale': { name: 'Make HD', credits: 12, multiplier: 6 },
  'low-light': { name: 'Low-light Fix', credits: 10, multiplier: 5 },
  denoise: { name: 'Denoise & Sharpen', credits: 10, multiplier: 5 },
  portrait: { name: 'Portrait Improve', credits: 12, multiplier: 6 },
  restore: { name: 'Restore Old Photo', credits: 20, multiplier: 10 },
};

function json(data, status = 200) { return NextResponse.json(data, { status }); }
function clean(value, max = 1000) { return String(value || '').trim().slice(0, max); }
function dayKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function monthKey(date = new Date()) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; }

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return json({
    providerReady: Boolean(process.env.ENHANCE_PHOTO_PROVIDER_URL),
    actions: Object.entries(ACTIONS).map(([id, action]) => ({ id, name: action.name, credits: action.credits })),
    privacy: 'Your original photo is never overwritten. Advanced enhancement creates a separate result.',
  });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const action = ACTIONS[body.action];
  if (!action) return json({ error: 'Choose a valid enhancement.' }, 400);
  const mediaId = clean(body.mediaId, 100);
  if (!mediaId) return json({ error: 'Choose a photo first.' }, 400);

  const db = await getDb();
  const media = await db.collection('media').findOne({ userId: user.id, id: mediaId, kind: 'photo', trashed: { $ne: true } });
  if (!media) return json({ error: 'Selected photo was not found.' }, 404);

  const providerUrl = process.env.ENHANCE_PHOTO_PROVIDER_URL;
  const providerKey = process.env.ENHANCE_PHOTO_PROVIDER_KEY;
  if (!providerUrl) return json({ error: 'Advanced enhancement is being activated. Manual editing remains available and no AI Credits were used.', code: 'provider_not_configured', coreAvailable: true }, 503);

  const preflight = await preflightAiRequest({
    db, user, feature: 'vision', prompt: `Photo enhancement: ${body.action}`,
    media: { mimeType: media.mime || 'image/jpeg', size: media.size || media.bytes || 0 },
    multiplier: action.multiplier, request,
  });
  if (!preflight.ok) return json({ error: preflight.error?.message || 'Enhancement is unavailable.', code: preflight.error?.code, ...(preflight.error || {}) }, preflight.status || 400);

  const id = randomUUID();
  const startedAt = Date.now();
  const now = new Date();
  await db.collection('photo_enhancement_jobs').insertOne({ id, userId: user.id, mediaId, action: body.action, actionName: action.name, status: 'processing', creditsReserved: preflight.credits, createdAt: now, updatedAt: now });

  try {
    const buffer = await storage.read({ provider: media.provider || 'local', storageKey: media.storageKey });
    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(providerKey ? { Authorization: `Bearer ${providerKey}` } : {}) },
      body: JSON.stringify({ requestId: id, action: body.action, imageBase64: buffer.toString('base64'), mimeType: media.mime || 'image/jpeg', preserveIdentity: true, preserveOriginal: true }),
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const result = await response.json();
    const outputUrl = clean(result.outputUrl || result.url, 2000);
    if (!outputUrl) throw new Error('Provider returned no output URL');

    const finished = new Date();
    await Promise.all([
      db.collection('photo_enhancement_jobs').updateOne({ userId: user.id, id }, { $set: { status: 'completed', outputUrl, completedAt: finished, updatedAt: finished } }),
      db.collection('ai_usage').insertOne({ id: randomUUID(), requestId: preflight.requestId, userId: user.id, plan: preflight.plan, feature: 'vision', provider: 'enhance-photo', credits: preflight.credits, estimatedCost: Number((preflight.credits * 0.001).toFixed(4)), durationMs: Date.now() - startedAt, status: 'success', errorCode: null, day: dayKey(finished), month: monthKey(finished), createdAt: finished }),
    ]);
    return json({ job: { id, status: 'completed', outputUrl, action: body.action }, creditsUsed: preflight.credits });
  } catch (error) {
    const failedAt = new Date();
    await Promise.all([
      db.collection('photo_enhancement_jobs').updateOne({ userId: user.id, id }, { $set: { status: 'failed', failureCode: 'provider_failed', updatedAt: failedAt } }),
      db.collection('ai_usage').insertOne({ id: randomUUID(), requestId: preflight.requestId, userId: user.id, plan: preflight.plan, feature: 'vision', provider: 'enhance-photo', credits: 0, estimatedCost: 0, durationMs: Date.now() - startedAt, status: 'failed', errorCode: 'provider_failed', day: dayKey(failedAt), month: monthKey(failedAt), createdAt: failedAt }),
    ]);
    return json({ error: 'Enhancement could not be completed. No AI Credits were charged.', code: 'provider_failed' }, 502);
  }
}
