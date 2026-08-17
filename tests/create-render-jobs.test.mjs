import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_RENDER_JOB_MAX_AGE_MS,
  canonicalRenderJobDeadlineExpired,
  canonicalRenderJobNeedsRecovery,
  recordCanonicalRenderAttemptCost,
  safeCanonicalRenderJob,
} from '../lib/create-render-jobs.server.js';

const base = new Date('2026-08-17T00:00:00.000Z');

function job(overrides = {}) {
  return {
    id: 'job-1',
    status: 'rendering',
    progress: 40,
    attemptCount: 1,
    providerJobId: 'provider-secret-ish-id',
    artifactDocumentId: 'internal-artifact-document-id',
    manifestHash: 'manifest-hash',
    failureMessage: 'raw provider failure detail',
    outputStorageKey: 'renders/owner/hash.mp4',
    createdAt: base,
    updatedAt: base,
    expiresAt: new Date(base.getTime() + CANONICAL_RENDER_JOB_MAX_AGE_MS),
    ...overrides,
  };
}

test('C1 hard render deadline remains inside the 45-minute reservation window', () => {
  assert.equal(CANONICAL_RENDER_JOB_MAX_AGE_MS, 20 * 60 * 1000);
  assert.equal(canonicalRenderJobDeadlineExpired(job(), new Date(base.getTime() + 19 * 60 * 1000)), false);
  assert.equal(canonicalRenderJobDeadlineExpired(job(), new Date(base.getTime() + 20 * 60 * 1000)), true);
});

test('C1 detects stalled dispatch, render and validation work before the hard deadline', () => {
  assert.deepEqual(
    canonicalRenderJobNeedsRecovery(job({ status: 'dispatching' }), new Date(base.getTime() + 61_000)),
    { recover: true, reason: 'render_dispatch_stalled' },
  );
  assert.deepEqual(
    canonicalRenderJobNeedsRecovery(job({ status: 'rendering' }), new Date(base.getTime() + 10 * 60 * 1000)),
    { recover: true, reason: 'render_worker_stalled' },
  );
  assert.deepEqual(
    canonicalRenderJobNeedsRecovery(job({ status: 'validating' }), new Date(base.getTime() + 2 * 60 * 1000)),
    { recover: true, reason: 'render_validation_stalled' },
  );
  assert.equal(
    canonicalRenderJobNeedsRecovery(job({ status: 'dispatch_unknown' }), new Date(base.getTime() + 5 * 60 * 1000)).recover,
    false,
  );
});

test('C1 user-safe job projection excludes worker and storage internals', () => {
  const safe = safeCanonicalRenderJob(job({ failureCode: 'render_worker_stalled' }));
  assert.equal(safe.id, 'job-1');
  assert.equal(safe.failureCode, 'render_worker_stalled');
  assert.equal('providerJobId' in safe, false);
  assert.equal('artifactId' in safe, false);
  assert.equal('manifestHash' in safe, false);
  assert.equal('failureMessage' in safe, false);
  assert.equal('outputStorageKey' in safe, false);
});

test('C1 failed provider spend is ledgered once per idempotent render job', async () => {
  const rows = [];
  const db = {
    collection(name) {
      assert.equal(name, 'product_cost_ledger');
      return {
        async insertOne(document) {
          if (rows.some(row => row._id === document._id)) {
            const error = new Error('duplicate');
            error.code = 11000;
            throw error;
          }
          rows.push(document);
          return { insertedId: document._id };
        },
      };
    },
  };
  const artifact = {
    id: 'artifact-attempt-1',
    userId: 'user-1',
    manifestHash: 'manifest-1',
    renderer: 'canonical-worker-v1',
    estimatedRenderCostUsd: 0.05,
    costReservationId: 'reservation-1',
  };

  const first = await recordCanonicalRenderAttemptCost({
    db,
    job: job(),
    artifact,
    actualRenderCostUsd: 0.07,
    outcome: 'render_provider_failed',
  });
  const duplicate = await recordCanonicalRenderAttemptCost({
    db,
    job: job(),
    artifact,
    actualRenderCostUsd: 0.07,
    outcome: 'render_provider_failed',
  });
  assert.equal(first.recorded, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actualCostUsd, 0.07);
  assert.equal(rows[0].approvedCostUsd, 0.05);
  assert.equal(rows[0].costOverrunUsd, 0.020000000000000004);
  assert.equal(rows[0].status, 'settled');
});

test('C1 does not create a zero-cost ledger placeholder when the worker reports no cost', async () => {
  let inserts = 0;
  const db = {
    collection() {
      return {
        async insertOne() {
          inserts += 1;
        },
      };
    },
  };
  const result = await recordCanonicalRenderAttemptCost({
    db,
    job: job(),
    artifact: { id: 'artifact-1', userId: 'user-1' },
    actualRenderCostUsd: null,
  });
  assert.equal(result.recorded, false);
  assert.equal(result.reason, 'render_actual_cost_unavailable');
  assert.equal(inserts, 0);
});
