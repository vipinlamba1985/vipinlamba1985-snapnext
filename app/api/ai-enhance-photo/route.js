import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { executeVisualProviderTask } from '@/lib/ai/visual-provider';
import { aiTaskCostCeiling } from '@/lib/ai/registry';

export const runtime = 'nodejs';

const ACTIONS = {
  'hd-upscale': { name: 'Make HD', credits: 12, multiplier: 6 },
  'low-light': { name: 'Low-light Fix', credits: 10, multiplier: 5 },
  denoise: { name: 'Denoise & Sharpen', credits: 10, multiplier: 5 },
  portrait: { name: 'Portrait Improve', credits: 12, multiplier: 6 },
  restore: { name: 'Restore Old Photo', credits: 20, multiplier: 10 },
};

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value, max = 1_000) {
  return String(value || '').trim().slice(0, max);
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return json({
    providerReady: Boolean(process.env.ENHANCE_PHOTO_PROVIDER_URL),
    actions: Object.entries(ACTIONS).map(([id, action]) => ({ id, name: action.name, credits: action.credits })),
    maximumProviderCostUsd: aiTaskCostCeiling('photo_enhance'),
    approvalRequired: true,
    privacy: 'Your original photo is never overwritten. Enhancement creates a separate result.',
  });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const action = ACTIONS[body.action];
  if (!action) return json({ error: 'Choose a valid enhancement.' }, 400);
  if (body.approved !== true) {
    return json({
      error: 'Review the Credits and confirm before enhancement starts.',
      code: 'approval_required',
      approvalRequired: true,
      credits: action.credits,
      maximumProviderCostUsd: aiTaskCostCeiling('photo_enhance'),
    }, 409);
  }
  const mediaId = clean(body.mediaId, 100);
  if (!mediaId) return json({ error: 'Choose a photo first.' }, 400);

  const providerUrl = process.env.ENHANCE_PHOTO_PROVIDER_URL;
  const providerKey = process.env.ENHANCE_PHOTO_PROVIDER_KEY;
  if (!providerUrl) return json({ error: 'Advanced enhancement is being activated. Manual editing remains available and no AI Credits were used.', code: 'provider_not_configured', coreAvailable: true }, 503);

  const db = await getDb();
  const media = await db.collection('media').findOne({ userId: user.id, id: mediaId, kind: 'photo', trashed: { $ne: true } });
  if (!media) return json({ error: 'Selected photo was not found.' }, 404);
  const buffer = await storage.read({ provider: media.provider || 'local', storageKey: media.storageKey });

  const id = randomUUID();
  const now = new Date();
  await db.collection('photo_enhancement_jobs').insertOne({
    id,
    userId: user.id,
    mediaId,
    action: body.action,
    actionName: action.name,
    status: 'processing',
    creditsReserved: action.credits,
    createdAt: now,
    updatedAt: now,
  });

  const result = await executeVisualProviderTask({
    db,
    user,
    request,
    taskId: 'photo_enhance',
    entitlementFeature: 'vision',
    creditMultiplier: action.multiplier,
    approved: true,
    prompt: `Photo enhancement: ${body.action}`,
    media: { mediaId, mimeType: media.mime || 'image/jpeg', size: media.size || media.bytes || buffer.length },
    providerUrl,
    providerKey,
    providerName: 'photo_enhancement',
    providerBody: {
      requestId: id,
      action: body.action,
      imageBase64: buffer.toString('base64'),
      mimeType: media.mime || 'image/jpeg',
      preserveIdentity: true,
      preserveOriginal: true,
    },
    metadata: { jobId: id, action: body.action },
  });

  if (!result.ok) {
    await db.collection('photo_enhancement_jobs').updateOne(
      { userId: user.id, id },
      { $set: { status: 'failed', failureCode: result.error?.code || 'provider_failed', updatedAt: new Date() } },
    );
    return json({
      error: result.error?.message || 'Enhancement could not be completed. No AI Credits were charged.',
      code: result.error?.code || 'provider_failed',
      weeklyWallet: result.error?.weeklyWallet || null,
    }, result.status || 502);
  }

  const finished = new Date();
  await db.collection('photo_enhancement_jobs').updateOne(
    { userId: user.id, id },
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
    job: { id, status: 'completed', outputUrl: result.result.outputUrl, action: body.action },
    creditsUsed: result.meta.creditsUsed,
    costProtected: true,
  });
}
