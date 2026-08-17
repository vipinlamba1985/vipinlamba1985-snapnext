import {
  buildCanonicalRenderProviderPayload,
  canonicalRenderProviderStatus,
  CANONICAL_REEL_PROVIDER_ACCEPT_TIMEOUT_MS,
} from './create-render-execution.server.js';
import { failCanonicalRender } from './create-render-artifacts.server.js';

const DISPATCHABLE_STATUSES = Object.freeze(['queued', 'dispatch_unknown']);
const ACTIVE_JOB_STATUSES = Object.freeze(['queued', 'dispatching', 'dispatch_unknown', 'rendering', 'validating']);

function resultDocument(result) {
  return result?.value || result || null;
}

function cleanProviderJobId(value) {
  return String(value || '').trim().slice(0, 300) || null;
}

export function safeCanonicalRenderJob(job = null) {
  if (!job) return null;
  return {
    id: job.id,
    artifactId: job.artifactDocumentId,
    manifestHash: job.manifestHash,
    status: job.status,
    progress: Number.isFinite(Number(job.progress)) ? Number(job.progress) : 0,
    attemptCount: Number(job.attemptCount || 0),
    providerJobId: job.providerJobId || null,
    failureCode: job.failureCode || null,
    failureMessage: job.failureMessage || null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
    acceptedAt: job.acceptedAt || null,
    completedAt: job.completedAt || null,
  };
}

export async function ensureCanonicalRenderJob({ db, userId, artifact }) {
  if (!db || !userId || !artifact?._id || !artifact?.id) throw new Error('Render job context is incomplete.');
  const now = new Date();
  const existing = await db.collection('render_jobs').findOne({ _id: artifact._id, userId });
  if (existing?.id === artifact.id) return existing;

  const job = {
    _id: artifact._id,
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

async function permanentlyFailDispatch({ db, job, code, message }) {
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
    payload = await buildCanonicalRenderProviderPayload({ db, userId, artifact, callbackUrl, env });
  } catch (error) {
    const failed = await permanentlyFailDispatch({
      db,
      job: claimed,
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
      code: String(responseBody.code || `render_provider_http_${response.status}`),
      message: responseBody.error || responseBody.message || `Renderer rejected the job with HTTP ${response.status}.`,
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
  const bounded = Math.max(0, Math.min(99, Number(progress) || 0));
  const result = await db.collection('render_jobs').findOneAndUpdate(
    { _id: job._id, userId: job.userId, id: job.id, status: { $in: ['rendering', 'dispatch_unknown'] } },
    { $set: { status: 'rendering', progress: bounded, updatedAt: new Date() } },
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
      $unset: { failureCode: '', failureMessage: '', lastDispatchError: '' },
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
    },
    { returnDocument: 'after' },
  );
  return resultDocument(result);
}
