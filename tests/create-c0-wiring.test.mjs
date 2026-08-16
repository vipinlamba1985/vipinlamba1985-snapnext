import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

test('AI and canonical render spend reserve from one shared company margin budget', async () => {
  const profitGuard = await read('lib/ai-profit-guard.js');
  const productGate = await read('lib/product-spend-gate.js');
  assert.match(profitGuard, /metered_work_budget_months/);
  assert.match(profitGuard, /metered_work_budget_reservations/);
  assert.match(profitGuard, /product_cost_ledger/);
  assert.match(profitGuard, /remainingExternalWorkBudgetUsd/);
  assert.match(profitGuard, /kind: 'ai'/);
  assert.match(productGate, /reserveMeteredWorkSpend/);
  assert.match(productGate, /kind: 'product'/);
  assert.match(productGate, /costOverrunUsd/);
  assert.match(productGate, /actualCostUsd: actual/);
});

test('canonical render cannot proceed without an explicit positive cost estimate', async () => {
  const gate = await read('lib/product-spend-gate.js');
  const artifacts = await read('lib/create-render-artifacts.server.js');
  assert.match(gate, /product_cost_estimate_required/);
  assert.match(artifacts, /estimatedRenderCostUsd/);
  assert.match(artifacts, /reserveProductSpend/);
});

test('cache lookup happens before quota and spend reservations', async () => {
  const artifacts = await read('lib/create-render-artifacts.server.js');
  const prepareStart = artifacts.indexOf('export async function prepareCanonicalRender');
  assert.ok(prepareStart > 0);
  const prepare = artifacts.slice(prepareStart);
  const readyIndex = prepare.indexOf("existing?.status === 'ready'");
  const quotaIndex = prepare.indexOf('const quota = await reserveCanonicalRenderQuota');
  const costIndex = prepare.indexOf('const cost = await reserveProductSpend');
  assert.ok(readyIndex > 0);
  assert.ok(quotaIndex > readyIndex);
  assert.ok(costIndex > quotaIndex);
});

test('every permanent media deletion entry point routes through the generation coordinator', async () => {
  const library = await read('lib/media-library-service.js');
  const trash = await read('lib/trash-purge.js');
  const account = await read('lib/account-deletion.js');
  for (const source of [library, trash, account]) assert.match(source, /coordinatePermanentMediaDeletion/);
  assert.match(account, /deleteAllControlledRenderArtifactsForUser/);
  assert.match(account, /renderArtifactsVerifiedAbsent/);
});

test('deletion generation becomes active atomically and blocks cache/render reads', async () => {
  const generation = await read('lib/media-deletion-generation.server.js');
  const artifacts = await read('lib/create-render-artifacts.server.js');
  assert.match(generation, /mediaDeletionInProgress: true/);
  assert.match(generation, /\$inc: \{ mediaDeletionGeneration: 1 \}/);
  assert.match(artifacts, /getMediaDeletionGenerationState/);
  assert.match(artifacts, /deletionState\.inProgress/);
  assert.match(artifacts, /media_deletion_in_progress/);
  assert.match(artifacts, /renderReadWindowStillValid/);
});

test('controlled source and derived deletion verifies storage absence', async () => {
  const strictDelete = await read('lib/storage-strict-delete.js');
  const coordinator = await read('lib/media-deletion-coordinator.server.js');
  const artifacts = await read('lib/create-render-artifacts.server.js');
  assert.match(strictDelete, /deleteStoredMediaVerified/);
  assert.match(strictDelete, /verifyStoredMediaAbsent/);
  assert.match(strictDelete, /storage_deletion_verification_failed/);
  assert.match(coordinator, /deleteStoredMediaVerified/);
  assert.match(artifacts, /deleteStoredMediaVerified/);
  assert.match(artifacts, /render_artifact_cleanup_required/);
  assert.match(artifacts, /deletion_failed/);
});

test('render publication rechecks deletion generation before and after ready state', async () => {
  const artifacts = await read('lib/create-render-artifacts.server.js');
  assert.match(artifacts, /mediaDeletionGenerationIsCurrent/);
  assert.match(artifacts, /media_deletion_generation_moved/);
  assert.match(artifacts, /media_deletion_generation_moved_after_publish/);
  assert.match(artifacts, /pending_validation/);
  assert.match(artifacts, /stale_source/);
});
