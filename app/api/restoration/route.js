import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { entitlementForUser, getEffectivePlan } from '@/lib/entitlements';
import { storage } from '@/lib/storage';
import { executeAiGatewayTask } from '@/lib/ai/gateway';
import { aiTaskCostCeiling } from '@/lib/ai/registry';
import { publicRestorationCatalog, getRestorationRecipe } from '@/lib/restoration/catalog';
import {
  getRestorationWallet,
  reserveRestorationUnits,
  settleRestorationUnits,
  releaseRestorationUnits,
} from '@/lib/restoration/wallet';
import {
  executeRestorationProvider,
  downloadRestorationOutput,
  isRestorationProviderReady,
} from '@/lib/restoration/provider';
import {
  findActiveRestorationJob,
  releaseStaleRestorationReservations,
} from '@/lib/restoration/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const MAX_SOURCE_BYTES = Math.max(1, Number(process.env.RESTORATION_MAX_SOURCE_MB || 25)) * 1024 * 1024;
const OUTPUT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const SAVE_LEASE_MS = 5 * 60 * 1000;

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function boundedOutputExpiry(value, completedAt) {
  const fallback = new Date(completedAt.getTime() + OUTPUT_LIFETIME_MS);
  if (!value) return fallback;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= completedAt.getTime()) return fallback;
  return new Date(Math.min(parsed.getTime(), fallback.getTime()));
}

function publicJob(job) {
  if (!job) return null;
  const safe = {
    id: job.id,
    mediaId: job.mediaId,
    recipeId: job.recipeId,
    recipeName: job.recipeName,
    unitsReserved: job.unitsReserved,
    status: job.status,
    originalPreserved: job.originalPreserved === true,
    outputExpiresAt: job.outputExpiresAt || null,
    completedAt: job.completedAt || null,
    savedMediaId: job.savedMediaId || null,
    savedAt: job.savedAt || null,
    createdAt: job.createdAt || null,
  };
  if (job.id && ['completed', 'saved', 'saving'].includes(job.status)) {
    safe.previewUrl = `/api/restoration/${encodeURIComponent(job.id)}/preview`;
  }
  return safe;
}

async function recordUsage({
  db,
  user,
  requestId,
  provider,
  model,
  actualCostUsd,
  costBasis,
  providerUsage,
  restorationUnits = 0,
  status,
  errorCode = null,
  durationMs = 0,
}) {
  const now = new Date();
  await db.collection('ai_usage').insertOne({
    id: randomUUID(),
    requestId,
    userId: user.id,
    plan: getEffectivePlan(user),
    feature: 'photo_restore',
    provider: provider || 'photo_restoration',
    model: model || null,
    credits: 0,
    restorationCredits: status === 'success' ? Math.max(0, Number(restorationUnits) || 0) : 0,
    estimatedCost: actualCostUsd || 0,
    actualCostUsd: actualCostUsd || 0,
    costBasis: costBasis || (status === 'success' ? 'ceiling_fallback' : 'failed_not_charged'),
    providerUsage: providerUsage || null,
    durationMs,
    status,
    errorCode,
    day: dayKey(now),
    month: monthKey(now),
    createdAt: now,
  }).catch(() => null);
}

async function storageUsage(db, userId) {
  const rows = await db.collection('media').aggregate([
    { $match: { userId, trashed: { $ne: true } } },
    { $group: { _id: null, bytes: { $sum: '$size' } } },
  ]).toArray();
  return Number(rows[0]?.bytes || 0);
}

async function existingRestoredMedia(db, userId, jobId) {
  return db.collection('media').findOne({
    userId,
    'restoration.jobId': jobId,
    trashed: { $ne: true },
  });
}

async function saveRestoredCopy({ db, user, job }) {
  const existing = await existingRestoredMedia(db, user.id, job.id);
  if (existing) {
    const now = new Date();
    await db.collection('photo_restoration_jobs').updateOne(
      { userId: user.id, id: job.id },
      { $set: { status: 'saved', savedMediaId: existing.id, savedAt: existing.createdAt || now, updatedAt: now }, $unset: { saveLeaseAt: '' } },
    );
    return { mediaId: existing.id, alreadySaved: true };
  }
  if (job.savedMediaId) return { mediaId: job.savedMediaId, alreadySaved: true };

  const now = new Date();
  const saveLeaseCutoff = new Date(now.getTime() - SAVE_LEASE_MS);
  const claimed = await db.collection('photo_restoration_jobs').findOneAndUpdate(
    {
      userId: user.id,
      id: job.id,
      savedMediaId: { $exists: false },
      $or: [
        { status: 'completed' },
        { status: 'saving', saveLeaseAt: { $lte: saveLeaseCutoff } },
      ],
    },
    { $set: { status: 'saving', saveLeaseAt: now, updatedAt: now } },
    { returnDocument: 'after' },
  );

  if (!claimed) {
    const latest = await db.collection('photo_restoration_jobs').findOne({ userId: user.id, id: job.id });
    if (latest?.savedMediaId) return { mediaId: latest.savedMediaId, alreadySaved: true };
    const recovered = await existingRestoredMedia(db, user.id, job.id);
    if (recovered) return { mediaId: recovered.id, alreadySaved: true };
    throw Object.assign(new Error('This restored copy is already being saved.'), { code: 'restoration_save_in_progress', status: 409 });
  }

  let savedObject = null;
  try {
    const source = await db.collection('media').findOne({ userId: user.id, id: claimed.mediaId, kind: 'photo', trashed: { $ne: true } });
    if (!source) throw Object.assign(new Error('The original photo could not be found.'), { code: 'source_photo_missing', status: 404 });

    const { buffer, mimeType } = await downloadRestorationOutput(claimed.outputUrl);
    const entitlement = entitlementForUser(user);
    const usedBytes = await storageUsage(db, user.id);
    if (!entitlement.realIsSuper && entitlement.plan.storageBytes && usedBytes + buffer.length > entitlement.plan.storageBytes) {
      throw Object.assign(new Error('There is not enough storage space for this restored copy.'), { code: 'storage_full', status: 400 });
    }

    const mediaId = randomUUID();
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const baseName = clean(String(source.name || 'memory').replace(/\.[^.]+$/, ''), 80).replace(/[^a-zA-Z0-9 _.-]/g, '') || 'memory';
    const name = `${baseName}-restored-${claimed.recipeId}.${extension}`;
    savedObject = await storage.save({ userId: user.id, fileId: mediaId, buffer, name, mime: mimeType });
    const savedAt = new Date();

    try {
      await db.collection('media').insertOne({
        id: mediaId,
        userId: user.id,
        name,
        size: buffer.length,
        hash: createHash('sha256').update(buffer).digest('hex'),
        mime: mimeType,
        kind: 'photo',
        storageKey: savedObject.storageKey,
        provider: savedObject.provider,
        favorite: false,
        trashed: false,
        derivedFrom: source.id,
        restoration: {
          jobId: claimed.id,
          recipeId: claimed.recipeId,
          recipeName: claimed.recipeName,
          preserveOriginal: true,
          provider: claimed.provider || null,
          model: claimed.model || null,
          createdAt: savedAt,
        },
        aiAnalysis: {
          tags: Array.isArray(source.aiAnalysis?.tags) ? source.aiAnalysis.tags : [],
          faces: [],
          autoAlbum: 'Restored Photos',
        },
        createdAt: savedAt,
      });
    } catch (error) {
      await storage.remove({ provider: savedObject.provider, storageKey: savedObject.storageKey }).catch(() => null);
      savedObject = null;
      throw error;
    }

    await db.collection('photo_restoration_jobs').updateOne(
      { userId: user.id, id: claimed.id, status: 'saving' },
      { $set: { status: 'saved', savedMediaId: mediaId, savedAt, updatedAt: savedAt }, $unset: { saveLeaseAt: '' } },
    );
    return { mediaId, alreadySaved: false };
  } catch (error) {
    await db.collection('photo_restoration_jobs').updateOne(
      { userId: user.id, id: claimed.id, status: 'saving' },
      { $set: { status: 'completed', saveFailureCode: error?.code || 'restoration_save_failed', updatedAt: new Date() }, $unset: { saveLeaseAt: '' } },
    ).catch(() => null);
    throw error;
  }
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  await releaseStaleRestorationReservations({ db, userId: user.id }).catch(() => null);
  const [wallet, jobs] = await Promise.all([
    getRestorationWallet(db, user.id),
    db.collection('photo_restoration_jobs').find({ userId: user.id }).sort({ createdAt: -1 }).limit(12).toArray(),
  ]);
  return json({
    ...publicRestorationCatalog(),
    wallet,
    jobs: jobs.map(publicJob),
    providerReady: isRestorationProviderReady(),
    maximumProviderCostUsd: aiTaskCostCeiling('photo_restore'),
    approvalRequired: true,
    originalPolicy: 'The original photo is never changed or overwritten. Saving creates a separate restored copy.',
    outputRetentionDays: 30,
  });
}

export async function POST(request) {
  const startedAt = Date.now();
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const operation = body.operation === 'save' ? 'save' : 'create';
  const db = await getDb();
  await releaseStaleRestorationReservations({ db, userId: user.id }).catch(() => null);

  if (operation === 'save') {
    const jobId = clean(body.jobId, 100);
    const job = await db.collection('photo_restoration_jobs').findOne({ userId: user.id, id: jobId, status: { $in: ['completed', 'saving', 'saved'] } });
    if (!job) return json({ error: 'The completed restoration could not be found.' }, 404);
    try {
      const saved = await saveRestoredCopy({ db, user, job });
      return json({ ok: true, ...saved, message: saved.alreadySaved ? 'This restored copy is already in SnapNext.' : 'Your restored copy is saved in SnapNext.' });
    } catch (error) {
      return json({ error: error?.message || 'The restored copy could not be saved.', code: error?.code || 'restoration_save_failed' }, error?.status || 502);
    }
  }

  const active = await findActiveRestorationJob({ db, userId: user.id });
  if (active) {
    return json({
      error: 'A restoration is already processing. Please let it finish before starting another.',
      code: 'restoration_in_progress',
      job: publicJob(active),
    }, 409);
  }

  const recipe = getRestorationRecipe(body.recipeId);
  if (!recipe) return json({ error: 'Choose a restoration type.' }, 400);
  if (body.approved !== true) {
    return json({
      error: 'Review the Restoration Credit charge and confirm before processing starts.',
      code: 'approval_required',
      approvalRequired: true,
      restorationCredits: recipe.units,
      maximumProviderCostUsd: aiTaskCostCeiling('photo_restore'),
    }, 409);
  }

  const mediaId = clean(body.mediaId, 100);
  if (!mediaId) return json({ error: 'Choose a photo first.' }, 400);
  if (!isRestorationProviderReady()) {
    return json({
      error: 'Photo Restoration is being activated. No Restoration Credits were used.',
      code: 'provider_not_configured',
      coreAvailable: true,
    }, 503);
  }
  const providerUrl = process.env.ENHANCE_PHOTO_PROVIDER_URL;

  const media = await db.collection('media').findOne({ userId: user.id, id: mediaId, kind: 'photo', trashed: { $ne: true } });
  if (!media) return json({ error: 'Selected photo was not found.' }, 404);
  const mimeType = String(media.mime || 'image/jpeg').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return json({ error: 'Restoration supports JPEG, PNG, and WebP photos.' }, 415);
  const sourceSize = Number(media.size || media.bytes || 0);
  if (sourceSize > MAX_SOURCE_BYTES) return json({ error: 'This photo is too large for restoration.' }, 413);

  const wallet = await getRestorationWallet(db, user.id);
  if (wallet.availableUnits < recipe.units) {
    return json({
      error: `This restoration needs ${recipe.units} Restoration Credit${recipe.units === 1 ? '' : 's'}.`,
      code: 'restoration_credits_required',
      requiredUnits: recipe.units,
      wallet,
    }, 402);
  }

  let sourceBuffer;
  try {
    sourceBuffer = await storage.read({ provider: media.provider || 'local', storageKey: media.storageKey });
  } catch {
    return json({ error: 'The selected photo is temporarily unavailable.', code: 'source_photo_unavailable' }, 502);
  }
  if (!sourceBuffer.length || sourceBuffer.length > MAX_SOURCE_BYTES) return json({ error: 'This photo is too large or unavailable.' }, 413);

  const jobId = randomUUID();
  const creditReservationId = `restoration:${jobId}`;
  const now = new Date();
  await db.collection('photo_restoration_jobs').insertOne({
    id: jobId,
    userId: user.id,
    mediaId,
    recipeId: recipe.id,
    recipeName: recipe.name,
    unitsReserved: recipe.units,
    status: 'processing',
    originalPreserved: true,
    createdAt: now,
    updatedAt: now,
  });

  let unitsReserved = false;
  const result = await executeAiGatewayTask({
    db,
    user,
    request,
    taskId: 'photo_restore',
    approved: true,
    prompt: recipe.prompt,
    media: { mediaId, mimeType, size: sourceBuffer.length },
    input: { recipeId: recipe.id, units: recipe.units },
    metadata: { jobId, recipeId: recipe.id, billingPolicy: 'prepaid', restorationUnits: recipe.units },
    preflight: async () => ({ ok: true, plan: getEffectivePlan(user, request), credits: 0, creditsRemaining: 0, dailyCreditsRemaining: 0 }),
    execute: async () => {
      if (!unitsReserved) {
        const creditReservation = await reserveRestorationUnits({
          db,
          userId: user.id,
          reservationId: creditReservationId,
          units: recipe.units,
          metadata: { jobId, mediaId, recipeId: recipe.id },
        });
        if (!creditReservation.ok) {
          const error = new Error(`This restoration needs ${recipe.units} Restoration Credit${recipe.units === 1 ? '' : 's'}.`);
          error.code = 'restoration_credits_required';
          error.status = 402;
          throw error;
        }
        unitsReserved = true;
      }
      return executeRestorationProvider({
        providerUrl,
        providerKey: process.env.ENHANCE_PHOTO_PROVIDER_KEY,
        jobId,
        recipe,
        sourceBuffer,
        mimeType,
      });
    },
    validateResult: (output) => output?.outputUrl
      ? { ok: true }
      : { ok: false, status: 502, error: { code: 'provider_output_missing', message: 'The restoration provider returned no usable image.' } },
    onSuccess: async ({ requestId, execution, durationMs, actualCostUsd }) => {
      await settleRestorationUnits({ db, reservationId: creditReservationId, jobId });
      await recordUsage({
        db,
        user,
        requestId,
        provider: execution.provider,
        model: execution.model,
        actualCostUsd,
        costBasis: execution.costBasis,
        providerUsage: execution.providerUsage,
        restorationUnits: recipe.units,
        status: 'success',
        durationMs,
      });
    },
    onFailure: async ({ requestId, execution, error, durationMs }) => {
      await releaseRestorationUnits({ db, reservationId: creditReservationId, reason: execution?.error?.code || error?.code || 'restoration_failed' });
      await recordUsage({
        db,
        user,
        requestId,
        provider: execution?.provider || 'photo_restoration',
        model: execution?.model || null,
        actualCostUsd: 0,
        costBasis: 'failed_not_charged',
        restorationUnits: 0,
        status: 'failed',
        errorCode: execution?.error?.code || error?.code || 'restoration_failed',
        durationMs,
      });
    },
  });

  if (!result.ok) {
    await db.collection('photo_restoration_jobs').updateOne(
      { userId: user.id, id: jobId },
      { $set: { status: 'failed', failureCode: result.error?.code || 'restoration_failed', updatedAt: new Date() } },
    );
    return json({
      error: result.error?.message || 'Restoration could not be completed. No Restoration Credits were used.',
      code: result.error?.code || 'restoration_failed',
      wallet: await getRestorationWallet(db, user.id),
    }, result.status || 502);
  }

  const completedAt = new Date();
  const outputExpiresAt = boundedOutputExpiry(result.result.outputExpiresAt, completedAt);
  const completedJob = {
    id: jobId,
    mediaId,
    recipeId: recipe.id,
    recipeName: recipe.name,
    unitsReserved: recipe.units,
    status: 'completed',
    outputExpiresAt,
    originalPreserved: true,
    completedAt,
    createdAt: now,
  };
  await db.collection('photo_restoration_jobs').updateOne(
    { userId: user.id, id: jobId },
    {
      $set: {
        ...completedJob,
        outputUrl: result.result.outputUrl,
        providerJobId: result.result.providerJobId,
        provider: result.meta.provider,
        model: result.meta.model,
        actualCostUsd: result.meta.actualCostUsd,
        costBasis: result.meta.costBasis,
        updatedAt: completedAt,
      },
    },
  );

  return json({
    job: publicJob(completedJob),
    restorationCreditsUsed: recipe.units,
    aiCreditsUsed: 0,
    wallet: await getRestorationWallet(db, user.id),
    costProtected: true,
    durationMs: Date.now() - startedAt,
  });
}
