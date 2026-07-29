import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { executeVisualProviderTask } from '@/lib/ai/visual-provider';
import { aiTaskCostCeiling } from '@/lib/ai/registry';

export const runtime = 'nodejs';

const TEMPLATES = [
  { id: 'animated-avatar', category: 'avatar', name: 'Animated Avatar', description: 'Turn a portrait into a polished animated profile picture.', credits: 25, output: 'image' },
  { id: 'cartoon-profile', category: 'avatar', name: 'Cartoon Profile', description: 'Create a bright illustrated profile portrait.', credits: 20, output: 'image' },
  { id: 'funny-face', category: 'fun', name: 'Funny Face', description: 'Add playful expressions and character styling.', credits: 15, output: 'image' },
  { id: 'dream-background', category: 'background', name: 'Dream Background', description: 'Place the subject in a ready-made cinematic or fantasy scene.', credits: 20, output: 'image' },
  { id: 'photo-motion', category: 'motion', name: 'Bring Photo to Life', description: 'Create a subtle moving-photo clip with natural camera motion.', credits: 60, output: 'video' },
  { id: 'portrait-wave', category: 'motion', name: 'Wave & Smile', description: 'Animate a portrait with a gentle smile and wave.', credits: 75, output: 'video' },
];

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return json({
    templates: TEMPLATES,
    providerReady: Boolean(process.env.AVATAR_MOTION_PROVIDER_URL),
    maximumProviderCostUsd: aiTaskCostCeiling('avatar_motion'),
    approvalRequired: true,
    privacy: 'Your selected photo is used only for this creation. SnapNext never publishes or shares the result automatically.',
  });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const template = TEMPLATES.find((item) => item.id === body.templateId);
  if (!template) return json({ error: 'Choose a valid creation style.' }, 400);
  if (body.approved !== true) {
    return json({
      error: 'Review the Credits and confirm before creation starts.',
      code: 'approval_required',
      approvalRequired: true,
      credits: template.credits,
      maximumProviderCostUsd: aiTaskCostCeiling('avatar_motion'),
    }, 409);
  }
  const mediaId = clean(body.mediaId, 100);
  if (!mediaId) return json({ error: 'Choose a portrait or photo first.' }, 400);

  const providerUrl = process.env.AVATAR_MOTION_PROVIDER_URL;
  const providerKey = process.env.AVATAR_MOTION_PROVIDER_KEY;
  if (!providerUrl) return json({ error: 'Avatar and motion generation is being activated. No AI Credits were used.', code: 'provider_not_configured', coreAvailable: true }, 503);

  const db = await getDb();
  const media = await db.collection('media').findOne({ userId: user.id, id: mediaId, kind: 'photo', trashed: { $ne: true } });
  if (!media) return json({ error: 'Selected photo was not found.' }, 404);
  const buffer = await storage.read({ provider: media.provider || 'local', storageKey: media.storageKey });

  const jobId = randomUUID();
  const createdAt = new Date();
  await db.collection('avatar_motion_jobs').insertOne({
    id: jobId,
    userId: user.id,
    mediaId,
    templateId: template.id,
    templateName: template.name,
    status: 'processing',
    outputType: template.output,
    creditsReserved: template.credits,
    prompt: clean(body.prompt),
    createdAt,
    updatedAt: createdAt,
  });

  const result = await executeVisualProviderTask({
    db,
    user,
    request,
    taskId: 'avatar_motion',
    entitlementFeature: 'story',
    creditMultiplier: template.credits / 3,
    approved: true,
    prompt: clean(body.prompt) || template.name,
    media: { mediaId, mimeType: media.mime || 'image/jpeg', size: media.size || media.bytes || buffer.length },
    providerUrl,
    providerKey,
    providerName: 'avatar_motion',
    providerBody: {
      requestId: jobId,
      mode: template.id,
      outputType: template.output,
      imageBase64: buffer.toString('base64'),
      mimeType: media.mime || 'image/jpeg',
      prompt: clean(body.prompt),
    },
    metadata: { jobId, templateId: template.id, outputType: template.output },
  });

  if (!result.ok) {
    await db.collection('avatar_motion_jobs').updateOne(
      { userId: user.id, id: jobId },
      { $set: { status: 'failed', failureCode: result.error?.code || 'provider_failed', updatedAt: new Date() } },
    );
    return json({
      error: result.error?.message || 'Creation could not be completed. No AI Credits were charged.',
      code: result.error?.code || 'provider_failed',
      weeklyWallet: result.error?.weeklyWallet || null,
    }, result.status || 502);
  }

  const finished = new Date();
  await db.collection('avatar_motion_jobs').updateOne(
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
    job: { id: jobId, status: 'completed', outputUrl: result.result.outputUrl, outputType: template.output },
    creditsUsed: result.meta.creditsUsed,
    creditsRemaining: result.meta.creditsRemaining,
    costProtected: true,
  });
}
