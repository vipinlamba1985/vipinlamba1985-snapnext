import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_AUTOMATIC_BATCHES,
  automaticContinuationExhausted,
  describeMigration,
  shouldContinueAutomaticBatch,
  shouldStartAutomaticPass,
} from '../lib/people-migration-policy.js';

const ready = {
  loading: false,
  engineReady: true,
  building: false,
  repairing: false,
  paused: false,
  needsMigration: true,
  selfRepairRequired: false,
  remaining: 5,
  exhausted: false,
};

test('automatic organizing starts when there is genuinely queued work', () => {
  assert.equal(shouldStartAutomaticPass(ready), true);
});

test('automatic organizing never starts just because items failed', () => {
  // remaining === 0 with failures present is the "needs attention" end state.
  assert.equal(shouldStartAutomaticPass({ ...ready, remaining: 0 }), false);
  assert.equal(shouldStartAutomaticPass({ ...ready, remaining: 0, needsMigration: true }), false);
});

test('automatic organizing does not start while other work holds the lane', () => {
  assert.equal(shouldStartAutomaticPass({ ...ready, loading: true }), false);
  assert.equal(shouldStartAutomaticPass({ ...ready, building: true }), false);
  assert.equal(shouldStartAutomaticPass({ ...ready, repairing: true }), false);
  assert.equal(shouldStartAutomaticPass({ ...ready, paused: true }), false);
  assert.equal(shouldStartAutomaticPass({ ...ready, engineReady: false }), false);
  assert.equal(shouldStartAutomaticPass({ ...ready, selfRepairRequired: true }), false);
});

test('an exhausted automatic pass does not re-arm itself', () => {
  // This is the guard that stops the effect rescheduling forever.
  assert.equal(shouldStartAutomaticPass({ ...ready, exhausted: true }), false);
});

test('a batch that processes nothing stops the run instead of looping', () => {
  assert.equal(shouldContinueAutomaticBatch({ batchIndex: 0, remaining: 10, lastBatchProcessed: null }), true);
  assert.equal(shouldContinueAutomaticBatch({ batchIndex: 1, remaining: 10, lastBatchProcessed: 12 }), true);
  // Nothing progressed — continuing would re-request the same failing work.
  assert.equal(shouldContinueAutomaticBatch({ batchIndex: 1, remaining: 10, lastBatchProcessed: 0 }), false);
});

test('automatic batches are bounded even when work keeps progressing', () => {
  assert.equal(shouldContinueAutomaticBatch({
    batchIndex: MAX_AUTOMATIC_BATCHES,
    maxBatches: MAX_AUTOMATIC_BATCHES,
    remaining: 999,
    lastBatchProcessed: 12,
  }), false);
});

test('a run that made no progress marks automatic mode exhausted', () => {
  assert.equal(automaticContinuationExhausted({ totalProcessed: 0, remaining: 7 }), true);
  assert.equal(automaticContinuationExhausted({ totalProcessed: 4, remaining: 7 }), false);
  assert.equal(automaticContinuationExhausted({ totalProcessed: 0, remaining: 0 }), false);
});

test('a permanently failing candidate set terminates instead of retrying forever', () => {
  // Drive the real loop: every batch returns processed = 0 and remaining stays high.
  let batches = 0;
  let lastBatchProcessed = null;
  const remaining = 25;
  while (shouldContinueAutomaticBatch({ batchIndex: batches, remaining, lastBatchProcessed })) {
    batches += 1;
    lastBatchProcessed = 0;
    assert.ok(batches <= MAX_AUTOMATIC_BATCHES, 'automatic batching must terminate');
  }
  assert.equal(batches, 1, 'a non-progressing pass stops after the first batch');
  assert.equal(automaticContinuationExhausted({ totalProcessed: 0, remaining }), true);
});

test('only failures left means finished, not still working', () => {
  const view = describeMigration({ total: 79, completed: 78, remaining: 0, failed: 1 });
  assert.equal(view.complete, true);
  assert.equal(view.hasActiveWork, false, 'no spinner when nothing is queued');
  assert.equal(view.needsAttention, true);
  assert.equal(view.failed, 1);
  assert.equal(view.completed, 78);
});

test('migration progress is reported as a bounded percentage', () => {
  assert.equal(describeMigration({ total: 100, completed: 25 }).percent, 25);
  assert.equal(describeMigration({ total: 0, completed: 0 }).percent, 0);
  assert.equal(describeMigration({ total: 10, completed: 999 }).percent, 100);
  assert.equal(describeMigration(null).percent, 0);
});

test('work still queued keeps the migration active', () => {
  const view = describeMigration({ total: 20, completed: 12, remaining: 8, failed: 0 });
  assert.equal(view.complete, false);
  assert.equal(view.hasActiveWork, true);
  assert.equal(view.needsAttention, false);
});
