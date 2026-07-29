import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { executeVisualProviderTask } from '@/lib/ai/visual-provider';
import { aiTaskCostCeiling } from '@/lib/ai/registry';

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

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value, max = 1_200) {
  return String(value || '').trim().slice(0, max);
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return json({
    templates: TEMPLATES,
    providerReady: Boolean(process.env.IMAGE_GENERATION_PROVIDER_URL || process.env.AVATAR_MOTION_PROVIDER_URL),
    aspectRatios: ['1:1', '4:5', '9:16', '16:9'],
    maximumProviderCostUsd: aiTaskCostCeiling('image_create'),
    approvalRequired: true,
    privacy: 'Your prompt and optional source photo are used only for this creation. Nothing is shared automatically.',
  });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const template = TEMPLATES.find((item) => item.id === body.templateId);
  if (!template) return json({ error: 'Choose a valid image template.' }, 400);
  const prompt = clean(body.prompt);
  if (!prompt) return json({ error: 'Describe the image you want to create.' }, 400);
  const aspectRatio = ['1:1', '4:5', '9:16', '16:9'].includes(body.aspectRatio) ? body.aspectRatio : '1:1';
  if (body.approved !== true) {
    return json({
      error: 'Review the Credits and confirm before image creation starts.',
      code: 'approval_required',
      approvalRequired: true,
      credits: template.credits,
      maximumProviderCostUsd: aiTaskCostCeiling('image_create'),
    }, 409);
  }

  const providerUrl = process.env.IMAGE_GENERATION_PROVIDER_URL || process.env.AVATAR_MOTION_PROVIDER_URL;
  const providerKey = process.env.IMAGE_GENERATION_PROVIDER_KEY || process.env.AVATAR_MOTION_PROVIDER_KEY;
  if (!providerUrl) return json({ error: 'Image creation is being activated. No AI Credits were used.', code: 'provider_not_configured', coreAvailable: true }, 503);

  const db = await getDb();
  const mediaId = clean(body.mediaId, 100);
  let media = null;
  let imageBase64 = null;
  if (mediaId) {
    media = await db.collection('media').findOne({ userId: user.id, id: mediaId, kind: 'photo', trashed: { $ne: true } });
    if (!media) return json({ error: 'Selected source photo was not found.' }, 404);
    const buffer = await storage.read({ provider: media.provider || 'local', storageKey: media.storageKey });
    imageBase64 = buffer.toString('base64');
  }

  const jobId = randomUUID();
  const now = new Date();
  await db.collection('image_generation_jobs').insertOne({
    id: jobId,
    userId: user.id,
    mediaId: media?.id || null,
    templateId: template.id,
    templateName: template.name,
    aspectRatio,
    status: 'processing',
    creditsReserved: template.credits,
    prompt,
    createdAt: now,
    updatedAt: now,
  });

  const result = await executeVisualProviderTask({
    db,
    user,
    request,
    taskId: 'image_create',
    entitlementFeature: 'story',
    creditMultiplier: template.credits / 3,
    approved: true,
    prompt,
    media: media ? { mediaId: media.id, mimeType: media.mime || 'image/jpeg', size: media.size || media.bytes || 0 } : null,
    providerUrl,
    providerKey,
    providerName: 'image_generation',
    providerBody: {
      requestId: jobId,
      mode: media ? 'image-to-image' : 'text-to-image',
      templateId: template.id,
      prompt,
      aspectRatio,
      outputType: 'image',
      imageBase64,
      mimeType: media?.mime || null,
    },
    metadata: { jobId, templateId: template.id, aspectRatio },
  });

  if (!result.ok) {
    await db.collection('image_generation_jobs').updateOne(
      { userId: user.id, id: jobId },
      { $set: { status: 'failed', failureCode: result.error?.code || 'provider_failed', updatedAt: new Date() } },
    );
    return json({
      error: result.error?.message || 'Image creation could not be completed. No AI Credits were charged.',
      code: result.error?.code || 'provider_failed',
      weeklyWallet: result.error?.weeklyWallet || null,
    }, result.status || 502);
  }

  const finished = new Date();
  await db.collection('image_generation_jobs').updateOne(
    { userId: user.id, id: jobId },
    { $set: {
      status: 'completed',
      outputUrl: result.result.outputUrl,
      providerJobId: result.result.providerJobId,
      actualCostUsd: result.meta.actualCostUsd,
      completedAt: finished,
      updatedAt: finished,
    } },
  );
  return json({
    job: { id: jobId, status: 'completed', outputUrl: result.result.outputUrl, outputType: 'image' },
    creditsUsed: result.meta.creditsUsed,
    creditsRemaining: result.meta.creditsRemaining,
    costProtected: true,
  });
}
