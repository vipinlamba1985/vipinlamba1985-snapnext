import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { preflightAiRequest } from '@/lib/ai-router';

export const runtime = 'nodejs';

const TEMPLATES = [
  { id: 'custom', name: 'Custom Creation', description: 'Create a new image from your own idea.', credits: 25 },
  { id: 'professional-headshot', name: 'Professional Headshot', description: 'Clean studio portrait for profiles and work.', credits: 30 },
  { id: 'travel-poster', name: 'Travel Poster', description: 'Turn a memory or idea into a cinematic travel poster.', credits: 30 },
  { id: 'birthday-card', name: 'Birthday Card', description: 'Create a bright personalized celebration design.', credits: 25 },
  { id: 'family-collage', name: 'Family Memory Collage', description: 'Create a warm memory-inspired family design.', credits: 35 },
  { id: 'phone-wallpaper', name: 'Phone Wallpaper', description: 'Create a polished vertical wallpaper.', credits: 25 },
  { id: 'instagram-post', name: 'Instagram Post', description: 'Create a square social-ready image.', credits: 25 },
  { id: 'artistic-restyle', name: 'Artistic Restyle', description: 'Transform a selected photo into an artistic image.', credits: 30 },
];

function json(data, status = 200) { return NextResponse.json(data, { status }); }
function clean(value, max = 1200) { return String(value || '').trim().slice(0, max); }
function dayKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function monthKey(date = new Date()) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; }

async function recordUsage(db, user, preflight, credits, startedAt, status, errorCode = null) {
  await db.collection('ai_usage').insertOne({
    id: randomUUID(), requestId: preflight.requestId, userId: user.id, plan: preflight.plan,
    feature: 'imageCreate', provider: 'visual_generation', credits: status === 'success' ? credits : 0,
    estimatedCost: 0, durationMs: Date.now() - startedAt, status, errorCode,
    day: dayKey(), month: monthKey(), createdAt: new Date(),
  });
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return json({
    templates: TEMPLATES,
    providerReady: !!(process.env.IMAGE_GENERATION_PROVIDER_URL || process.env.AVATAR_MOTION_PROVIDER_URL),
    aspectRatios: ['1:1', '4:5', '9:16', '16:9'],
    privacy: 'Your prompt and optional source photo are used only for the requested creation. Nothing is shared automatically.',
  });
}

export async function POST(request) {
  const startedAt = Date.now();
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const template = TEMPLATES.find((item) => item.id === body.templateId);
  if (!template) return json({ error: 'Choose a valid image template.' }, 400);
  const prompt = clean(body.prompt, 1200);
  if (!prompt) return json({ error: 'Describe the image you want to create.' }, 400);
  const aspectRatio = ['1:1', '4:5', '9:16', '16:9'].includes(body.aspectRatio) ? body.aspectRatio : '1:1';

  const db = await getDb();
  let media = null;
  const mediaId = clean(body.mediaId, 100);
  if (mediaId) {
    media = await db.collection('media').findOne({ userId: user.id, id: mediaId, kind: 'photo', trashed: { $ne: true } });
    if (!media) return json({ error: 'Selected source photo was not found.' }, 404);
  }

  const providerUrl = process.env.IMAGE_GENERATION_PROVIDER_URL || process.env.AVATAR_MOTION_PROVIDER_URL;
  const providerKey = process.env.IMAGE_GENERATION_PROVIDER_KEY || process.env.AVATAR_MOTION_PROVIDER_KEY;
  if (!providerUrl) return json({ error: 'Image creation is being activated. No AI Credits were used.', code: 'provider_not_configured', coreAvailable: true }, 503);

  const preflight = await preflightAiRequest({
    db, user, feature: 'story', prompt,
    media: media ? { mimeType: media.mime || 'image/jpeg', size: media.size } : null,
    multiplier: template.credits / 3, request,
  });
  if (!preflight.ok) return json({ error: preflight.error }, preflight.status || 400);

  const jobId = randomUUID();
  await db.collection('image_generation_jobs').insertOne({
    id: jobId, userId: user.id, mediaId: media?.id || null, templateId: template.id,
    templateName: template.name, aspectRatio, status: 'processing', creditsReserved: template.credits,
    requestId: preflight.requestId, prompt, createdAt: new Date(), updatedAt: new Date(),
  });

  try {
    let imageBase64 = null;
    if (media) {
      const buffer = await storage.read({ provider: media.provider || 'local', storageKey: media.storageKey });
      imageBase64 = buffer.toString('base64');
    }
    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(providerKey ? { Authorization: `Bearer ${providerKey}` } : {}) },
      body: JSON.stringify({
        requestId: jobId, mode: media ? 'image-to-image' : 'text-to-image', templateId: template.id,
        prompt, aspectRatio, outputType: 'image', imageBase64, mimeType: media?.mime || null,
      }),
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const result = await response.json();
    const outputUrl = clean(result.outputUrl || result.url, 2000);
    if (!outputUrl) throw new Error('Provider returned no output URL');
    await db.collection('image_generation_jobs').updateOne({ userId: user.id, id: jobId }, { $set: { status: 'completed', outputUrl, completedAt: new Date(), updatedAt: new Date() } });
    await recordUsage(db, user, preflight, template.credits, startedAt, 'success');
    return json({ job: { id: jobId, status: 'completed', outputUrl, outputType: 'image' }, creditsUsed: template.credits, creditsRemaining: Math.max(0, preflight.creditsRemaining - template.credits) });
  } catch (error) {
    await db.collection('image_generation_jobs').updateOne({ userId: user.id, id: jobId }, { $set: { status: 'failed', failureCode: 'provider_failed', updatedAt: new Date() } });
    await recordUsage(db, user, preflight, template.credits, startedAt, 'failed', 'provider_failed');
    return json({ error: 'Image creation could not be completed. No AI Credits were charged.', code: 'provider_failed' }, 502);
  }
}
