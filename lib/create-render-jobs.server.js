import {
  buildCanonicalRenderProviderPayload,
  canonicalRenderProviderStatus,
  CANONICAL_REEL_PROVIDER_ACCEPT_TIMEOUT_MS,
} from './create-render-execution.server.js';
import { failCanonicalRender } from './create-render-artifacts.server.js';

const DISPATCHABLE_STATUSES = Object.freeze(['queued', 'dispatch_unknown']);
const ACTIVE_JOB_STATUSES = Object.freeze(['queued', 'dispatching', 'dispatch_unknown', 'rendering', 'uploading', 'validating']);

export const CANONICAL_RENDER_JOB_MAX_AGE_MS = 20 * 60 * 1000;
export const CANONICAL_RENDER_DISPATCH_STALE_MS = 60 * 1000;
export const CANONICAL_RENDER_ACTIVE_STALE_MS = 10 * 60 * 1000;
export const CANONICAL_RENDER_VALIDATING_STALE_MS = 2 * 60 * 1000;

function resultDocument(result) {
  return result?.value || result || null;
}

function cleanProviderJobId(value) {
  return String(value || '').trim().slice(0, 300) || null;
}

function dateMs(value) {
  if (!value) return Number.NaN;
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

function nowMs(now = new Date()) {
  const value = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Number.isFinite(value) ? value : Date.now();
}

function validReportedCost(value) {
  const actual = Number(value);
  return Number.isFinite(actual) && actual >= 0 && actual <= 100 ? actual : null;
}

function providerReportedCost(body = {}) {
  return validReportedCost(body.actualRenderCostUsd ?? body.cost?.actualUsd);
}

export function canonicalRenderJobExpiresAt(job = {}) {
  const explicit = dateMs(job.expiresAt);
  if (Number.isFinite(explicit)) return explicit;
  const created = dateMs(job.createdAt);
  return Number.isFinite(created) ? created + CANONICAL_RENDER_JOB_MAX_AGE_MS : Number.NaN;
}

export function canonicalRenderJobDeadlineExpired(job = {}, now = new Date()) {
  const deadline = canonicalRenderJobExpiresAt(job);
  return Number.isFinite(deadline) && nowMs(now) >= deadline;
}

export function canonicalRenderJobNeedsRecovery(job = {}, now = new Date()) {
  if (!job?.id || !ACTIVE_JOB_STATUSES.includes(job.status)) {
    return { recover: false, reason: null };
  }
  if (canonicalRenderJobDeadlineExpired(job, now)) {
    return { recover: true, reason: 'render_job_deadline_exceeded' };
  }

  const updatedAt = dateMs(job.updatedAt || job.createdAt);
  if (!Number.isFinite(updatedAt)) return { recover: true, reason: 'render_job_timestamp_invalid' };
  const idleMs = Math.max(0, nowMs(now) - updatedAt);

  if (job.status === 'dispatching' && idleMs >= CANONICAL_RENDER_DISPATCH_STALE_MS) {
    return { recover: true, reason: 'render_dispatch_stalled' };
  }
  if ((job.status === 'rendering' || job.status === 'uploading') && idleMs >= CANONICAL_RENDER_ACTIVE_STALE_MS) {
    return { recover: true, reason: 'render_worker_stalled' };
  }
  if (job.status === 'validating' && idleMs >= CANONICAL_RENDER_VALIDATING_STALE_MS) {
    return { recover: true, reason: 'render_validation_stalled' };
  }

  return { recover: false, reason: null };
}

export function safeCanonicalRenderJob(job = null) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progress: Number.isFinite(Number(job.progress)) ? Number(job.progress) : 0,
    attemptCount: Number(job.attemptCount || 0),
    failureCode: job.failureCode || null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
    completedAt: job.completedAt || null,
  };
}

export async function recordCanonicalRenderAttemptCost({
  db,
  job,
  artifact,
  actualRenderCostUsd,
  outcome = 'failed',
}) {
  if (!db || !job?.id || !artifact) return { recorded: false, reason: 'render_cost_context_missing' };
  const actual = validReportedCost(actualRenderCostUsd);
  if (actual === null) return { recorded: false, reason: 'render_actual_cost_unavailable' };

  const approved = Math.max(0, Number(artifact.estimatedRenderCostUsd) || 0);
  const costOverrunUsd = Math.max(0, actual - approved);
  const ledgerId = `canonical-render-attempt:${job.id}`;
  try {
    await db.collection('product_cost_ledger').insertOne({
      _id: ledgerId,
      id: ledgerId,
      reservationId: artifact.costReservationId || null,
      feature: 'canonical_reel_render',
      userId: artifact.userId || job.userId || null,
      provider: artifact.renderer || 'canonical-worker-v1',
      actualCostUsd: actual,
      approvedCostUsd: approved,
      costOverrunUsd,
      status: 'settled',
      metadata: {
        manifestHash: artifact.manifestHash,
        artifactId: artifact.id,
        renderJobId: job.id,
        outcome: String(outcome || 'failed').slice(0, 100),
        approvedCostUsd: approved,
        costOverrunUsd,
      },
      createdAt: new Date(),
    });
    return { recorded: true, actualCostUsd: actual, approvedCostUsd: approved, costOverrunUsd };
  } catch (error) {
    if (error?.code === 11000) return { recorded: false, duplicate: true };
    throw error;
  }
}

export async function ensureCanonicalRenderJob({ db, userId, artifact }) {
  if (!db || !userId || !artifact?._id || !artifact?.id) throw new Error('Render job context is incomplete.');
  const now = new Date();
  const existing = await db.collection('render_jobs').findOne({ _id: artifact._id, userId });
  if (existing?.id === artifact.id) return existing;

  const job = {
    id: artifact.id,
    userId,
    artifactDocumentId: artifact._id,
    manifestHash: artifact.manifestHash,
    outputStorageKey: artifact.storageKey,
    status: artifact.status === 'pending_validation' ? 'validating' : 'queued',
    progress: 0,
    attemptCount: 0,
    providerJobId: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + CANONICAL_RENDER_JOB_MAX_AGE_MS),
  };
  await db.collection('render_jobs').updateOne(
    { _id: artifact._id, userId },
    {
      $set: job,
      $unset: {
        failureCode: '',
        failureMessage: '',
        acceptedAt: '',
        completedAt: '',
        lastDispatchError: '',
        outputMultipartUploadId: '',
        outputExpectedBytes: '',
        outputProbe: '',
      },
    },
    { upsert: true },
  );
  return db.collection('render_jobs').findOne({ _id: artifact._id, userId });
}

export async function getCanonicalRenderJob({ db, userId, jobId }) {
  if (!db || !userId || !jobId) return null;
  return db.collection('render_jobs').findOne({ userId, id: String(jobId) });
}

async function markDispatchUnknown({ db, job, error }) {
  const now = new Date();
  await db.collection('render_jobs').updateOne(
    { _id: job._id, userId: job.userId, id: job.id, status: 'dispatching' },
    {
      $set: {
        status: 'dispatch_unknown',
        lastDispatchError: error?.message || String(error || 'dispatch_unknown'),
        updatedAt: now,
      },
    },
  );
  return db.collection('render_jobs').findOne({ _id: job._id, userId: job.userId });
}

async function permanentlyFailDispatch({ db, job, artifact, code, message, actualRenderCostUsd = null }) {
  await recordCanonicalRenderAttemptCost({
    db,
    job,
    artifact,
    actualRenderCostUsd,
    outcome: code || 'render_provider_rejected',
  });
  await failCanonicalRender({
    db,
    userId: job.userId,
    artifactId: job.artifactDocumentId,
    error: Object.assign(new Error(message || code), { code }),
  });
  const now = new Date();
  await db.collection('render_jobs').updateOne(
    { _id: job._id, userId: job.userId, id: job.id },
    {
      $set: {
        status: 'failed',
        failureCode: code,
        failureMessage: String(message || code).slice(0, 1000),
        completedAt: now,
        updatedAt: now,
      },
    },
  );
  return db.collection('render_jobs').findOne({ _id: job._id, userId: job.userId });
}

export async function dispatchCanonicalRenderJob({
  db,
  userId,
  job,
  artifact,
  callbackUrl,
  env = process.env,
  fetchImpl = fetch,
}) {
  if (!db || !userId || !job || !artifact) return { accepted: false, reason: 'render_job_context_missing' };
  if (canonicalRenderJobDeadlineExpired(job)) return { accepted: false, permanent: true, reason: 'render_job_deadline_exceeded', job };
  const providerStatus = canonicalRenderProviderStatus(env);
  if (!providerStatus.ready) return { accepted: false, reason: 'render_provider_not_configured', providerStatus };
  if (!DISPATCHABLE_STATUSES.includes(job.status)) {
    return { accepted: ACTIVE_JOB_STATUSES.includes(job.status), alreadyActive: true, job };
  }

  const claimedResult = await db.collection('render_jobs').findOneAndUpdate(
    { _id: job._id, userId, id: job.id, status: { $in: DISPATCHABLE_STATUSES } },
    {
      $set: { status: 'dispatching', updatedAt: new Date() },
      $inc: { attemptCount: 1 },
    },
    { returnDocument: 'after' },
  );
  const claimed = resultDocument(claimedResult);
  if (!claimed) {
    const current = await db.collection('render_jobs').findOne({ _id: job._id, userId });
    return { accepted: ACTIVE_JOB_STATUSES.includes(current?.status), alreadyActive: true, job: current };
  }

  let payload;
  try {
    payload = await buildCanonicalRenderProviderPayload({ db, userId, artifact, callbackUrl });
  } catch (error) {
    const failed = await permanentlyFailDispatch({
      db,
      job: claimed,
      artifact,
      code: error?.code || 'render_payload_invalid',
      message: error?.message || 'Canonical render payload could not be prepared.',
    });
    return { accepted: false, permanent: true, reason: error?.code || 'render_payload_invalid', job: failed };
  }

  let response;
  try {
    response = await fetchImpl(env.CREATE_RENDER_PROVIDER_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.CREATE_RENDER_PROVIDER_KEY}`,
        'idempotency-key': claimed.id,
        'x-snapnext-render-contract': 'snapnext-canonical-reel-v1',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CANONICAL_REEL_PROVIDER_ACCEPT_TIMEOUT_MS),
    });
  } catch (error) {
    const unknown = await markDispatchUnknown({ db, job: claimed, error });
    return { accepted: false, retryable: true, reason: 'render_dispatch_unknown', job: unknown };
  }

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500;
    if (retryable) {
      const unknown = await markDispatchUnknown({
        db,
        job: claimed,
        error: new Error(`Renderer returned HTTP ${response.status}`),
      });
      return { accepted: false, retryable: true, reason: 'render_provider_retryable_rejection', job: unknown };
    }
    const failed = await permanentlyFailDispatch({
      db,
      job: claimed,
      artifact,
      code: String(responseBody.code || `render_provider_http_${response.status}`),
      message: responseBody.error || responseBody.message || `Renderer rejected the job with HTTP ${response.status}.`,
      actualRenderCostUsd: providerReportedCost(responseBody),
    });
    return { accepted: false, permanent: true, reason: failed.failureCode, job: failed };
  }

  const now = new Date();
  const acceptedResult = await db.collection('render_jobs').findOneAndUpdate(
    { _id: claimed._id, userId, id: claimed.id, status: 'dispatching' },
    {
      $set: {
        status: 'rendering',
        providerJobId: cleanProviderJobId(responseBody.jobId || responseBody.providerJobId),
        acceptedAt: now,
        updatedAt: now,
      },
      $unset: { lastDispatchError: '' },
    },
    { returnDocument: 'after' },
  );
  const acceptedJob = resultDocument(acceptedResult) || await db.collection('render_jobs').findOne({ _id: claimed._id, userId });
  return { accepted: true, job: acceptedJob };
}

export async function markCanonicalRenderJobProgress({ db, job, progress = 0 }) {
  const bounded = Math.max(0, Math.min(94, Number(progress) || 0));
  const result = await db.collection('render_jobs').findOneAndUpdate(
    { _id: job._id, userId: job.userId, id: job.id, status: { $in: ['rendering', 'dispatch_unknown'] } },
    { $set: { status: 'rendering', progress: bounded, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  return resultDocument(result);
}

export async function markCanonicalRenderJobUploading({ db, job, uploadId, outputBytes }) {
  const result = await db.collection('render_jobs').findOneAndUpdate(
    { _id: job._id, userId: job.userId, id: job.id, status: { $in: ACTIVE_JOB_STATUSES } },
    {
      $set: {
        status: 'uploading',
        progress: 95,
        outputMultipartUploadId: uploadId,
        outputExpectedBytes: Number(outputBytes),
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );
  return resultDocument(result);
}

export async function markCanonicalRenderJobValidating({ db, job, probe }) {
  const result = await db.collection('render_jobs').findOneAndUpdate(
    { _id: job._id, userId: job.userId, id: job.id, status: { $in: ACTIVE_JOB_STATUSES } },
    { $set: { status: 'validating', progress: 99, outputProbe: probe, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  return resultDocument(result);
}

export async function markCanonicalRenderJobReady({ db, job }) {
  const now = new Date();
  const result = await db.collection('render_jobs').findOneAndUpdate(
    { _id: job._id, userId: job.userId, id: job.id },
    {
      $set: { status: 'ready', progress: 100, completedAt: now, updatedAt: now },
      $unset: {
        failureCode: '',
        failureMessage: '',
        lastDispatchError: '',
        outputMultipartUploadId: '',
        outputExpectedBytes: '',
      },
    },
    { returnDocument: 'after' },
  );
  return resultDocument(result);
}

export async function markCanonicalRenderJobFailed({ db, job, code = 'render_failed', message = 'Render failed.' }) {
  const now = new Date();
  const result = await db.collection('render_jobs').findOneAndUpdate(
    { _id: job._id, userId: job.userId, id: job.id },
    {
      $set: {
        status: 'failed',
        failureCode: String(code).slice(0, 200),
        failureMessage: String(message).slice(0, 1000),
        completedAt: now,
        updatedAt: now,
      },
      $unset: {
        outputMultipartUploadId: '',
        outputExpectedBytes: '',
      },
    },
    { returnDocument: 'after' },
  );
  return resultDocument(result);
}
