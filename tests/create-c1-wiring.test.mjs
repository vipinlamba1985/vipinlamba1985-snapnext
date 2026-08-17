import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

test('C1 request API stays on top of C0 quota, spend, source and deletion gates', async () => {
  const route = await read('app/api/create/reels/render/route.js');
  assert.match(route, /validateCanonicalCreateManifest/);
  assert.match(route, /validateCanonicalRenderExecution/);
  assert.match(route, /estimateCanonicalRenderCostUsd/);
  assert.match(route, /prepareCanonicalRender/);
  assert.match(route, /ensureCanonicalRenderJob/);
  assert.match(route, /dispatchCanonicalRenderJob/);
  assert.match(route, /failCanonicalRender/);
  assert.match(route, /canonicalRenderCallbackUrl/);
  assert.doesNotMatch(route, /new URL\([^\n]*request\.url/);
});

test('C1 stalled attempts are cleaned and re-prepared before reservations can expire', async () => {
  const route = await read('app/api/create/reels/render/route.js');
  const jobs = await read('lib/create-render-jobs.server.js');
  assert.match(route, /canonicalRenderJobNeedsRecovery/);
  assert.match(route, /recoverStalledAttempt/);
  assert.match(route, /markCanonicalRenderJobFailed/);
  assert.match(jobs, /CANONICAL_RENDER_JOB_MAX_AGE_MS = 20 \* 60 \* 1000/);
  assert.match(jobs, /render_dispatch_stalled/);
  assert.match(jobs, /render_worker_stalled/);
  assert.match(jobs, /render_validation_stalled/);
});

test('C1 provider gets signed private reads but no future final-object write capability at dispatch', async () => {
  const execution = await read('lib/create-render-execution.server.js');
  assert.match(execution, /storageAdapter\.getReadUrl/);
  assert.match(execution, /readUrl: track\.audioUrl/);
  assert.match(execution, /snapnext-controlled-multipart/);
  assert.match(execution, /uploadPlanStatus: 'upload_plan'/);
  assert.match(execution, /snapnext-canonical-reel-v1/i);
  assert.doesNotMatch(execution, /uploadUrl/);
  assert.doesNotMatch(execution, /PutObjectCommand/);
  assert.doesNotMatch(execution, /CREATE_RENDER_CALLBACK_SECRET[^\n]*payload/i);
});

test('C1 multipart publication is controlled by SnapNext and completion stays server-side', async () => {
  const multipart = await read('lib/create-render-multipart.server.js');
  const callback = await read('app/api/internal/create-render/callback/route.js');
  assert.match(multipart, /CreateMultipartUploadCommand/);
  assert.match(multipart, /UploadPartCommand/);
  assert.match(multipart, /CompleteMultipartUploadCommand/);
  assert.match(multipart, /renders\\\//);
  assert.match(callback, /status === 'upload_plan'/);
  assert.match(callback, /activeSourceWindow/);
  assert.match(callback, /completeCanonicalRenderMultipartUpload/);
  assert.match(callback, /body\.parts/);
});

test('verified S3 deletion revokes pending multipart future writes before object deletion', async () => {
  const strictDelete = await read('lib/storage-strict-delete.js');
  const abortIndex = strictDelete.indexOf('await abortS3MultipartUploadsForKey');
  const deleteIndex = strictDelete.indexOf('await client.send(new DeleteObjectCommand');
  assert.match(strictDelete, /ListMultipartUploadsCommand/);
  assert.match(strictDelete, /AbortMultipartUploadCommand/);
  assert.ok(abortIndex >= 0);
  assert.ok(deleteIndex > abortIndex);
});

test('C1 render job metadata is removed during account deletion', async () => {
  const accountDeletion = await read('lib/account-deletion.js');
  assert.match(accountDeletion, /db\.collection\('render_jobs'\)\.deleteMany\(\{ userId \}\)/);
  assert.match(accountDeletion, /renderJobs: count\(renderJobs\)/);
});

test('C1 dispatch is idempotent and ambiguous network failures remain retryable', async () => {
  const jobs = await read('lib/create-render-jobs.server.js');
  assert.match(jobs, /DISPATCHABLE_STATUSES/);
  assert.match(jobs, /dispatch_unknown/);
  assert.match(jobs, /'idempotency-key': claimed\.id/);
  assert.match(jobs, /AbortSignal\.timeout/);
  assert.match(jobs, /retryable: true/);
});

test('C1 callback rejects expired work, ledgers reported failed cost, and does not swallow C0 cleanup', async () => {
  const callback = await read('app/api/internal/create-render/callback/route.js');
  assert.match(callback, /canonicalRenderJobDeadlineExpired/);
  assert.match(callback, /recordCanonicalRenderAttemptCost/);
  assert.match(callback, /actualRenderCostUsd: cost\.value/);
  assert.match(callback, /render_job_deadline_exceeded/);
  assert.doesNotMatch(callback, /failCanonicalRender\([\s\S]{0,500}?\.catch\(\(\) => null\)/);
});

test('C1 callback authenticates, validates codec and source window, completes storage, then finalizes', async () => {
  const callback = await read('app/api/internal/create-render/callback/route.js');
  const auth = callback.indexOf("if (!renderCallbackSecretMatches");
  const probe = callback.indexOf('const probeValidation = validateCanonicalRenderProbe');
  const sourceWindow = callback.indexOf('const publicationWindow = await activeSourceWindow');
  const complete = callback.indexOf('await completeCanonicalRenderMultipartUpload');
  const pending = callback.indexOf('let pending = await markCanonicalRenderPendingValidation');
  const finalize = callback.indexOf('const finalized = await finalizeCanonicalRender');
  assert.ok(auth >= 0);
  assert.ok(probe > auth);
  assert.ok(sourceWindow > probe);
  assert.ok(complete > sourceWindow);
  assert.ok(pending > complete);
  assert.ok(finalize > pending);
  assert.match(callback, /video\/mp4/);
});

test('C1 polling endpoint exposes only stable user-facing status and no worker/storage internals', async () => {
  const statusRoute = await read('app/api/create/reels/render/[jobId]/route.js');
  const jobs = await read('lib/create-render-jobs.server.js');
  assert.match(statusRoute, /getCanonicalRenderJob/);
  assert.match(statusRoute, /getReadUrl/);
  assert.match(statusRoute, /retryRecommended/);
  assert.doesNotMatch(statusRoute, /artifact\.lastError/);
  assert.doesNotMatch(statusRoute, /artifact\.deletionFailure/);
  assert.doesNotMatch(statusRoute, /outputStorageKey/);
  assert.doesNotMatch(statusRoute, /CREATE_RENDER_PROVIDER_KEY/);
  assert.doesNotMatch(jobs.match(/export function safeCanonicalRenderJob[\s\S]*?\n}\n/)?.[0] || '', /providerJobId|artifactDocumentId|failureMessage|outputStorageKey/);
});
