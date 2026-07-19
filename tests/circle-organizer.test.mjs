import test from 'node:test';
import assert from 'node:assert/strict';

const modulePromise = import('../lib/circle-organizer.js');

test('balanced mode sends high priority items to today', async () => {
  const { classifySignal } = await modulePromise;
  const result = classifySignal({ priority: 85 }, { mode: 'balanced' });
  assert.equal(result.bucket, 'today');
  assert.equal(result.delivery, 'show_now');
});

test('balanced mode keeps useful items for digest', async () => {
  const { classifySignal } = await modulePromise;
  const result = classifySignal({ priority: 60 }, { mode: 'balanced' });
  assert.equal(result.bucket, 'later');
  assert.equal(result.delivery, 'digest');
});

test('saved links are organized into the library unless urgent', async () => {
  const { classifySignal } = await modulePromise;
  const result = classifySignal({ priority: 60, signalType: 'link' }, { mode: 'balanced' });
  assert.equal(result.bucket, 'library');
});

test('due reminders move to today', async () => {
  const { classifySignal } = await modulePromise;
  const result = classifySignal({ priority: 20, signalType: 'reminder', dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }, { mode: 'calm' });
  assert.equal(result.bucket, 'today');
  assert.equal(result.reason, 'Due within 24 hours');
});

test('digest counts only visible signals', async () => {
  const { buildDigest } = await modulePromise;
  const digest = buildDigest([
    { bucket: 'today', isRead: false, isHidden: false },
    { bucket: 'later', isHidden: false },
    { bucket: 'library', isHidden: false },
    { bucket: 'today', isRead: false, isHidden: true },
  ]);
  assert.deepEqual(digest.counts, { received: 3, important: 1, digest: 1, organizedSilently: 1 });
});
