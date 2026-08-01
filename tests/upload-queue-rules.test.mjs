import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPLOAD_STATUS,
  batchHeadline,
  isRetryableReason,
  isTerminalStatus,
  retryableItems,
  selectAutomaticUploadItems,
  selectManualRetryItems,
  summarizeBatch,
} from '../lib/upload-queue-rules.js';

const file = () => ({ size: 1 });
const item = (patch = {}) => ({ id: patch.id || 'id', checked: true, size: 10, retryable: true, file: file(), status: UPLOAD_STATUS.queued, ...patch });

test('a failed upload reaches a terminal status and is not active work', () => {
  assert.equal(isTerminalStatus(UPLOAD_STATUS.needsAttention), true);
  assert.equal(isTerminalStatus(UPLOAD_STATUS.done), true);
  assert.equal(isTerminalStatus(UPLOAD_STATUS.skipped), true);
  assert.equal(isTerminalStatus(UPLOAD_STATUS.queued), false);
  assert.equal(isTerminalStatus(UPLOAD_STATUS.uploading), false);
});

test('automatic runs never pick up items that need attention', () => {
  const queue = [
    item({ id: 'a', status: UPLOAD_STATUS.queued }),
    item({ id: 'b', status: UPLOAD_STATUS.needsAttention }),
    item({ id: 'c', status: UPLOAD_STATUS.done }),
    item({ id: 'd', status: UPLOAD_STATUS.skipped }),
  ];
  assert.deepEqual(selectAutomaticUploadItems(queue).map((row) => row.id), ['a']);
});

test('adding a new batch does not retry an older failed item', () => {
  // The failed item from the previous batch stays put when new files arrive.
  const afterFailure = [item({ id: 'old', status: UPLOAD_STATUS.needsAttention })];
  const afterAddingMore = [...afterFailure, item({ id: 'new1' }), item({ id: 'new2' })];
  const selected = selectAutomaticUploadItems(afterAddingMore).map((row) => row.id);
  assert.deepEqual(selected, ['new1', 'new2']);
  assert.equal(selected.includes('old'), false);
});

test('repeated automatic selection is stable and never grows', () => {
  // Models a component re-render / effect re-run: the same queue must yield the
  // same work every time, so nothing is re-uploaded by a render alone.
  const queue = [item({ id: 'a', status: UPLOAD_STATUS.needsAttention }), item({ id: 'b', status: UPLOAD_STATUS.done })];
  for (let pass = 0; pass < 5; pass += 1) {
    assert.deepEqual(selectAutomaticUploadItems(queue), []);
  }
});

test('a manual retry only targets the items the user selected', () => {
  const queue = [
    item({ id: 'a', status: UPLOAD_STATUS.needsAttention }),
    item({ id: 'b', status: UPLOAD_STATUS.needsAttention }),
    item({ id: 'c', status: UPLOAD_STATUS.done }),
  ];
  assert.deepEqual(selectManualRetryItems(queue, ['a']).map((row) => row.id), ['a']);
  assert.deepEqual(selectManualRetryItems(queue).map((row) => row.id), ['a', 'b']);
});

test('items that cannot succeed on retry are not offered for retry', () => {
  assert.equal(isRetryableReason('storage_unavailable'), true);
  assert.equal(isRetryableReason('duplicate'), false);
  assert.equal(isRetryableReason('too_large'), false);
  assert.equal(isRetryableReason('unsupported_type'), false);
  assert.equal(isRetryableReason('authentication_expired'), false);

  const queue = [
    item({ id: 'a', status: UPLOAD_STATUS.needsAttention, retryable: false }),
    item({ id: 'b', status: UPLOAD_STATUS.needsAttention, file: null }),
    item({ id: 'c', status: UPLOAD_STATUS.needsAttention }),
  ];
  assert.deepEqual(retryableItems(queue).map((row) => row.id), ['c']);
});

test('one failed upload does not stop the rest of the batch from finishing', () => {
  const queue = [
    item({ id: 'a', status: UPLOAD_STATUS.done }),
    item({ id: 'b', status: UPLOAD_STATUS.done }),
    item({ id: 'c', status: UPLOAD_STATUS.needsAttention }),
  ];
  const summary = summarizeBatch(queue);
  assert.equal(summary.saved, 2);
  assert.equal(summary.needsAttention, 1);
  assert.equal(summary.active, 0);
  // Complete: a needs-attention item is finished work, so no spinner remains.
  assert.equal(summary.complete, true);
  assert.equal(summary.percent, 100);
});

test('batch summary reports the correct tone for success, skip and attention', () => {
  const allGood = summarizeBatch([item({ status: UPLOAD_STATUS.done }), item({ status: UPLOAD_STATUS.skipped })]);
  assert.equal(allGood.tone, 'success');
  assert.equal(batchHeadline(allGood), 'Backup finished');

  const mixed = summarizeBatch([
    item({ status: UPLOAD_STATUS.done }),
    item({ status: UPLOAD_STATUS.skipped }),
    item({ status: UPLOAD_STATUS.needsAttention }),
  ]);
  assert.equal(mixed.tone, 'attention');
  assert.equal(batchHeadline(mixed), 'Backup finished with items to review');

  const allFailed = summarizeBatch([item({ status: UPLOAD_STATUS.needsAttention })]);
  assert.equal(allFailed.tone, 'error');
  assert.equal(batchHeadline(allFailed), 'Backup could not finish');
});

test('a realistic mixed batch finishes with an accurate summary', () => {
  // 96 protected, 2 duplicates, 1 storage-full skip, 1 needing attention.
  const queue = [
    ...Array.from({ length: 96 }, (_, index) => item({ id: `s${index}`, status: UPLOAD_STATUS.done })),
    item({ id: 'd1', status: UPLOAD_STATUS.skipped, reason: 'duplicate' }),
    item({ id: 'd2', status: UPLOAD_STATUS.skipped, reason: 'duplicate' }),
    item({ id: 'f1', status: UPLOAD_STATUS.skipped, reason: 'storage_full' }),
    item({ id: 'a1', status: UPLOAD_STATUS.needsAttention, reason: 'storage_unavailable' }),
  ];
  const summary = summarizeBatch(queue);
  assert.equal(summary.total, 100);
  assert.equal(summary.saved, 96);
  assert.equal(summary.skipped, 3);
  assert.equal(summary.needsAttention, 1);
  assert.equal(summary.complete, true);
  assert.equal(summary.tone, 'attention');
});

test('a batch still uploading is not reported as complete', () => {
  const summary = summarizeBatch([item({ status: UPLOAD_STATUS.done }), item({ status: UPLOAD_STATUS.uploading })]);
  assert.equal(summary.complete, false);
  assert.equal(summary.active, 1);
  assert.equal(batchHeadline(summary), 'Backing up now');
});

test('released file references are never selected as work', () => {
  // Completed items drop their File reference to free memory on large batches.
  const queue = [item({ id: 'a', status: UPLOAD_STATUS.queued, file: null })];
  assert.deepEqual(selectAutomaticUploadItems(queue), []);
});
