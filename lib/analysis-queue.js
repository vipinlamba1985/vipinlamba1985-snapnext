import { v4 as uuidv4 } from 'uuid';
import { storage } from '@/lib/storage';
import {
  ASSET_INTELLIGENCE_PIPELINE_VERSION,
  analyzeAssetIntelligence,
  isSupportedAsset,
  toLegacyAiAnalysis,
} from '@/lib/asset-intelligence';

const MAX_IMAGE_ANALYSIS_BYTES = Number(process.env.AI_IMAGE_ANALYSIS_MAX_BYTES || 25 * 1024 * 1024);
const MAX_VIDEO_ANALYSIS_BYTES = Number(process.env.AI_VIDEO_ANALYSIS_MAX_BYTES || 15 * 1024 * 1024);
const ACTIVE_JOB_STATUSES = ['queued', 'processing'];

function maxBytesFor(media) {
  if (media?.kind === 'video') return MAX_VIDEO_ANALYSIS_BYTES;
  if (media?.kind === 'photo') return MAX_IMAGE_ANALYSIS_BYTES;
  return Number.MAX_SAFE_INTEGER;
}

function analysisFilter(media) {
  return {
    userId: media.userId,
    mediaId: media.id,
    pipelineVersion: ASSET_INTELLIGENCE_PIPELINE_VERSION,
  };
}

export async function enqueueAssetAnalysis({ db, media, reason = 'manual', priority = 50, force = false }) {
  if (!db) throw new Error('Database is required.');
  if (!isSupportedAsset(media)) return { ok: false, status: 'unsupported', mediaId: media?.id || null };

  const filter = analysisFilter(media);
  if (!force) {
    const ready = await db.collection('asset_intelligence').findOne({
      ...filter,
      sourceHash: media.hash || null,
      status: 'ready',
    });
    if (ready) return { ok: true, status: 'already_indexed', mediaId: media.id, intelligenceId: ready.id };

    const active = await db.collection('analysis_jobs').findOne({
      ...filter,
      status: { $in: ACTIVE_JOB_STATUSES },
    });
    if (active) return { ok: true, status: active.status, mediaId: media.id, jobId: active.id };
  }

  const now = new Date();
  const job = {
    id: uuidv4(),
    ...filter,
    sourceHash: media.hash || null,
    kind: media.kind,
    mime: media.mime || '',
    size: Number(media.size || 0),
    reason,
    priority: Math.max(0, Math.min(100, Number(priority) || 50)),
    status: 'queued',
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('analysis_jobs').insertOne(job);
  await db.collection('asset_intelligence').updateOne(filter, {
    $set: {
      id: `${media.userId}:${media.id}:${ASSET_INTELLIGENCE_PIPELINE_VERSION}`,
      ...filter,
      sourceHash: media.hash || null,
      name: media.name || '',
      kind: media.kind,
      mime: media.mime || '',
      status: 'queued',
      providerStatus: 'queued',
      updatedAt: now,
    },
    $setOnInsert: { createdAt: now },
  }, { upsert: true });

  return { ok: true, status: 'queued', mediaId: media.id, jobId: job.id };
}

async function claimNextJob({ db, userId = null, workerId }) {
  const now = new Date();
  const query = {
    status: 'queued',
    $or: [
      { nextAttemptAt: { $exists: false } },
      { nextAttemptAt: { $lte: now } },
    ],
  };
  if (userId) query.userId = userId;

  const result = await db.collection('analysis_jobs').findOneAndUpdate(
    query,
    {
      $set: {
        status: 'processing',
        workerId,
        startedAt: now,
        updatedAt: now,
      },
      $inc: { attemptCount: 1 },
    },
    { sort: { priority: -1, createdAt: 1 }, returnDocument: 'after' },
  );

  return result?.value || result || null;
}

async function markJob({ db, jobId, patch }) {
  await db.collection('analysis_jobs').updateOne(
    { id: jobId },
    { $set: { ...patch, updatedAt: new Date() } },
  );
}

async function persistIntelligence({ db, media, record }) {
  const now = new Date();
  const filter = analysisFilter(media);
  const id = `${media.userId}:${media.id}:${ASSET_INTELLIGENCE_PIPELINE_VERSION}`;
  await db.collection('asset_intelligence').updateOne(filter, {
    $set: { id, ...record, updatedAt: now },
    $setOnInsert: { createdAt: record.createdAt || now },
  }, { upsert: true });

  const previous = media.aiAnalysis || {};
  await db.collection('media').updateOne(
    { id: media.id, userId: media.userId },
    {
      $set: {
        aiAnalysis: toLegacyAiAnalysis(record, previous),
        intelligenceUpdatedAt: now,
      },
    },
  );

  return id;
}

export async function processAnalysisJob({ db, job }) {
  const media = await db.collection('media').findOne({
    id: job.mediaId,
    userId: job.userId,
    trashed: { $ne: true },
  });

  if (!media) {
    await markJob({ db, jobId: job.id, patch: { status: 'cancelled', finishedAt: new Date(), errorCode: 'media_not_found' } });
    return { ok: false, status: 'cancelled', mediaId: job.mediaId, errorCode: 'media_not_found' };
  }

  if (!isSupportedAsset(media)) {
    await markJob({ db, jobId: job.id, patch: { status: 'cancelled', finishedAt: new Date(), errorCode: 'unsupported_asset' } });
    return { ok: false, status: 'cancelled', mediaId: media.id, errorCode: 'unsupported_asset' };
  }

  const maxBytes = maxBytesFor(media);
  if (Number(media.size || 0) > maxBytes) {
    await db.collection('asset_intelligence').updateOne(analysisFilter(media), {
      $set: {
        id: `${media.userId}:${media.id}:${ASSET_INTELLIGENCE_PIPELINE_VERSION}`,
        ...analysisFilter(media),
        sourceHash: media.hash || null,
        name: media.name || '',
        kind: media.kind,
        mime: media.mime || '',
        status: 'deferred',
        providerStatus: media.kind === 'video' ? 'video_requires_streaming_pipeline' : 'asset_too_large_for_inline_analysis',
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    }, { upsert: true });
    await markJob({ db, jobId: job.id, patch: { status: 'deferred', finishedAt: new Date(), errorCode: 'requires_streaming_pipeline' } });
    return { ok: true, status: 'deferred', mediaId: media.id, reason: 'requires_streaming_pipeline' };
  }

  let buffer = null;
  if (media.kind === 'photo' || media.kind === 'video') {
    buffer = await storage.read({ provider: media.provider || 'local', storageKey: media.storageKey });
  }

  const record = await analyzeAssetIntelligence({ media, buffer });
  const intelligenceId = await persistIntelligence({ db, media, record });
  await markJob({
    db,
    jobId: job.id,
    patch: {
      status: 'completed',
      finishedAt: new Date(),
      resultStatus: record.status,
      intelligenceId,
      errorCode: null,
    },
  });

  return { ok: true, status: 'completed', mediaId: media.id, intelligenceId, resultStatus: record.status };
}

async function retryOrFail({ db, job, error }) {
  const attempts = Number(job.attemptCount || 1);
  const maxAttempts = Number(job.maxAttempts || 3);
  const message = String(error?.message || error || 'analysis_failed').slice(0, 800);
  if (attempts < maxAttempts) {
    const delayMinutes = Math.min(60, 2 ** attempts);
    const nextAttemptAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    await markJob({
      db,
      jobId: job.id,
      patch: {
        status: 'queued',
        nextAttemptAt,
        errorCode: error?.code || 'analysis_failed',
        errorMessage: message,
      },
    });
    return { ok: false, status: 'retry_scheduled', mediaId: job.mediaId, nextAttemptAt };
  }

  await markJob({
    db,
    jobId: job.id,
    patch: {
      status: 'failed',
      finishedAt: new Date(),
      errorCode: error?.code || 'analysis_failed',
      errorMessage: message,
    },
  });
  return { ok: false, status: 'failed', mediaId: job.mediaId, errorCode: error?.code || 'analysis_failed' };
}

export async function processAnalysisJobs({ db, userId = null, limit = 1, workerId = null }) {
  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 1));
  const id = workerId || `worker-${uuidv4()}`;
  const results = [];

  for (let index = 0; index < safeLimit; index += 1) {
    const job = await claimNextJob({ db, userId, workerId: id });
    if (!job) break;
    try {
      results.push(await processAnalysisJob({ db, job }));
    } catch (error) {
      results.push(await retryOrFail({ db, job, error }));
    }
  }

  return { workerId: id, processed: results.length, results };
}

export async function getAnalysisStatus({ db, userId, mediaId = null }) {
  if (mediaId) {
    const [intelligence, job] = await Promise.all([
      db.collection('asset_intelligence').findOne({ userId, mediaId }),
      db.collection('analysis_jobs').findOne({ userId, mediaId }, { sort: { createdAt: -1 } }),
    ]);
    return { intelligence, job };
  }

  const [jobCounts, intelligenceCounts, recent] = await Promise.all([
    db.collection('analysis_jobs').aggregate([
      { $match: { userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('asset_intelligence').aggregate([
      { $match: { userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('analysis_jobs').find({ userId }).sort({ createdAt: -1 }).limit(20).toArray(),
  ]);

  return {
    jobs: Object.fromEntries(jobCounts.map((row) => [row._id, row.count])),
    intelligence: Object.fromEntries(intelligenceCounts.map((row) => [row._id, row.count])),
    recent,
  };
}
