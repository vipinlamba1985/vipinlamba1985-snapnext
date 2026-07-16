import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, normalizeCounts } from '../lib/smart-sync/job-policy.js';

test('Smart Sync jobs allow pause, resume, retry and cancellation only from safe states', () => {
  assert.equal(canTransition('queued', 'running'), true);
  assert.equal(canTransition('running', 'paused'), true);
  assert.equal(canTransition('paused', 'queued'), true);
  assert.equal(canTransition('failed', 'queued'), true);
  assert.equal(canTransition('completed', 'queued'), false);
  assert.equal(canTransition('cancelled', 'running'), false);
});

test('Smart Sync progress is clamped to the job total', () => {
  assert.deepEqual(normalizeCounts({ saved: 3, skipped: 2, failed: 1 }, 10), {
    completed: 6, saved: 3, skipped: 2, failed: 1, remaining: 4,
  });
  assert.equal(normalizeCounts({ completed: 999 }, 10).completed, 10);
  assert.equal(normalizeCounts({ completed: -2 }, 10).completed, 0);
});
