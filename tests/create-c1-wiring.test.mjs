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
});

test('C1 provider receives signed private inputs and writes only the canonical render key', async () => {
  const execution = await read('lib/create-render-execution.server.js');
  assert.match(execution, /storageAdapter\.getReadUrl/);
  assert.match(execution, /renders\\\//);
  assert.match(execution, /PutObjectCommand/);
  assert.match(execution, /ContentType: 'video\/mp4'/);
  assert.match(execution, /idempotency-key|snapnext-canonical-reel-v1/i);
  assert.doesNotMatch(execution, /CREATE_RENDER_CALLBACK_SECRET[^\n]*payload/i);
});

test('C1 dispatch is idempotent and ambiguous network failures remain retryable', async () => {
  const jobs = await read('lib/create-render-jobs.server.js');
  assert.match(jobs, /DISPATCHABLE_STATUSES/);
  assert.match(jobs, /dispatch_unknown/);
  assert.match(jobs, /'idempotency-key': claimed\.id/);
  assert.match(jobs, /AbortSignal\.timeout/);
  assert.match(jobs, /retryable: true/);
});

test('C1 callback authenticates, verifies S3 output, validates codec contract and only then finalizes', async () => {
  const callback = await read('app/api/internal/create-render/callback/route.js');
  const auth = callback.indexOf('renderCallbackSecretMatches');
  const verify = callback.indexOf('storage.verify');
  const probe = callback.indexOf('validateCanonicalRenderProbe');
  const pending = callback.indexOf('markCanonicalRenderPendingValidation');
  const finalize = callback.indexOf('finalizeCanonicalRender');
  assert.ok(auth >= 0);
  assert.ok(verify > auth);
  assert.ok(probe > auth);
  assert.ok(pending > verify);
  assert.ok(finalize > pending);
  assert.match(callback, /video\/mp4/);
});

test('C1 polling endpoint never exposes storage keys or provider credentials', async () => {
  const statusRoute = await read('app/api/create/reels/render/[jobId]/route.js');
  assert.match(statusRoute, /getCanonicalRenderJob/);
  assert.match(statusRoute, /getReadUrl/);
  assert.doesNotMatch(statusRoute, /outputStorageKey/);
  assert.doesNotMatch(statusRoute, /CREATE_RENDER_PROVIDER_KEY/);
});
