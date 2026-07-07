import { v4 as uuidv4 } from 'uuid';
import { storage } from '@/lib/storage';
import { ASSET_INTELLIGENCE_PIPELINE_VERSION, isSupportedAsset } from '@/lib/asset-intelligence';
import { analyzeAssetIntelligenceCached } from '@/lib/asset-intelligence-cached';

const MAX_IMAGE_BYTES = Number(process.env.AI_IMAGE_ANALYSIS_MAX_BYTES || 25 * 1024 * 1024);
const MAX_VIDEO_BYTES = Number(process.env.AI_VIDEO_ANALYSIS_MAX_BYTES || 15 * 1024 * 1024);
const ACTIVE_STATUSES = ['queued', 'processing'];

function filterFor(media) {
  return {
    userId: media.userId,
    mediaId: media.id,
    pipelineVersion: ASSET_INTELLIGENCE_PIPELINE_VERSION,
  };
}

function maxBytesFor(media) {
  if (media?.kind === 'video') return MAX_VIDEO_BYTES;
  if (media?.kind === 'photo') return MAX_IMAGE_BYTES;
  return Number.MAX_SAFE_INTEGER;
}

export async function enqueueAssetAnalysis({ db, media, reason = 'manual', priority = 50 }) {
  if (!db) throw new Error('Database is required.');
  if (!isSupportedAsset(media)) return { ok: false, status: 'unsupported', mediaId: media?.id || null };

  const filter = filterFor(media);
  const ready = await db.collection('asset_intelligence').findOne({
    ...filter,
    sourceHash: media.hash || null,
    status: 'ready',
  });
  if (ready) return { ok: true, status: 'already_indexed', mediaId: media.id, intelligenceId: ready.id };

  const active = await db.collection('analysis_jobs').findOne({ ...filter, status: { $in: ACTIVE_STATUSES } });
  if (active) return { ok: true, status: active.status, mediaId: media.id, jobId: active.id };

  const now = new Date();
  const job = {
    id: uuidv4(),
    ...filter,
    sourceHash: media.hash || null,
    kind: media.kind,
    mime: media.mime || '',
    size: Number(media.size || 0),
    reason: String(reason || 'manual').slice(0, 80),
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

async function claimNextJob({ db, userId, workerId }) {
  const now = new Date();
  const query = {
    status: 'queued',
    $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }],
  };
  if (userId) query.userId = userId;

  const result = await db.collection('analysis_jobs').findOneAndUpdate(
    query,
    {
      $set: { status: 'processing', workerId, startedAt: now, updatedAt: now },
      $inc: { attemptCount: 1 },
    },
    { sort: { priority: -1, createdAt: 1 }, returnDocument: 'after' },
  );
  return result?.value || result || null;
}

async function markJob(db, jobId, patch) {
  await db.collection('analysis_jobs').updateOne({ id: jobId }, { $set: { ...patch, updatedAt: new Date() } });
}

async function persistIntelligence({ db, media, record }) {
  const now = new Date();
  const id = `${media.userId}:${media.id}:${ASSET_INTELLIGENCE_PIPELINE_VERSION}`;
  await db.collection('asset_intelligence').updateOne(filterFor(media), {
    $set: { id, ...record, updatedAt: now },
    $setOnInsert: { createdAt: record.createdAt || now },
  }, { upsert: true });
  return id;
}

async function processJob({ db, job }) {
  const media = await db.collection('media').findOne({ id: job.mediaId, userId: job.userId, trashed: { $ne: true } });
  if (!media) {
    await markJob(db, job.id, { status: 'cancelled', finishedAt: new Date(), errorCode: 'media_not_found' });
    return { ok: false, status: 'cancelled', mediaId: job.mediaId, errorCode: 'media_not_found' };
  }
  if (!isSupportedAsset(media)) {
    await markJob(db, job.id, { status: 'cancelled', finishedAt: new Date(), errorCode: 'unsupported_asset' });
    return { ok: false, status: 'cancelled', mediaId: media.id, errorCode: 'unsupported_asset' };
  }

  if (Number(media.size || 0) > maxBytesFor(media)) {
    const now = new Date();
    await db.collection('asset_intelligence').updateOne(filterFor(media), {
      $set: {
        id: `${media.userId}:${media.id}:${ASSET_INTELLIGENCE_PIPELINE_VERSION}`,
        ...filterFor(media),
        sourceHash: media.hash || null,
        name: media.name || '',
        kind: media.kind,
        mime: media.mime || '',
        status: 'deferred',
        providerStatus: media.kind === 'video' ? 'video_requires_streaming_pipeline' : 'asset_too_large_for_inline_analysis',
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    }, { upsert: true });
    await markJob(db, job.id, { status: 'deferred', finishedAt: now, errorCode: 'requires_streaming_pipeline' });
    return { ok: true, status: 'deferred', mediaId: media.id };
  }

  let buffer = null;
  if (media.kind === 'photo' || media.kind === 'video') {
    buffer = await storage.read({ provider: media.provider || 'local', storageKey: media.storageKey });
  }

  const record = await analyzeAssetIntelligenceCached({ media, buffer });
  const intelligenceId = await persistIntelligence({ db, media, record });
  await markJob(db, job.id, {
    status: 'completed',
    finishedAt: new Date(),
    resultStatus: record.status,
    intelligenceId,
    errorCode: null,
  });
  return { ok: true, status: 'completed', mediaId: media.id, intelligenceId, resultStatus: record.status };
}

async function retryOrFail({ db, job, error }) {
  const attempts = Number(job.attemptCount || 1);
  const maxAttempts = Number(job.maxAttempts || 3);
  const errorCode = error?.code || 'analysis_failed';
  const errorMessage = String(error?.message || error || 'analysis_failed').slice(0, 800);
  if (attempts < maxAttempts) {
    const nextAttemptAt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60 * 1000);
    await markJob(db, job.id, { status: 'queued', nextAttemptAt, errorCode, errorMessage });
    return { ok: false, status: 'retry_scheduled', mediaId: job.mediaId, nextAttemptAt };
  }
  await markJob(db, job.id, { status: 'failed', finishedAt: new Date(), errorCode, errorMessage });
  return { ok: false, status: 'failed', mediaId: job.mediaId, errorCode };
}

export async function processAnalysisJobs({ db, userId = null, limit = 1, workerId = null }) {
  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 1));
  const id = workerId || `worker-${uuidv4()}`;
  const results = [];
  for (let index = 0; index < safeLimit; index += 1) {
    const job = await claimNextJob({ db, userId, workerId: id });
    if (!job) break;
    try {
      results.push(await processJob({ db, job }));
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

export async function resetAiIndexForUser({ db, userId }) {
  const [jobs, intelligence, feedback] = await Promise.all([
    db.collection('analysis_jobs').deleteMany({ userId }),
    db.collection('asset_intelligence').deleteMany({ userId }),
    db.collection('ai_feedback_events').deleteMany({ userId }),
  ]);
  return {
    deletedJobs: jobs.deletedCount || 0,
    deletedIntelligence: intelligence.deletedCount || 0,
    deletedFeedback: feedback.deletedCount || 0,
  };
}
