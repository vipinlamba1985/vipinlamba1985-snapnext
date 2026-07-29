import test from 'node:test';
import assert from 'node:assert/strict';
import { purgeExpiredTrash, trashCutoff, trashPurgeBatchSize, trashRetentionDays } from '../lib/trash-purge.js';

test('trash retention and batch settings are bounded', () => {
  assert.equal(trashRetentionDays('30'), 30);
  assert.equal(trashRetentionDays('0'), 1);
  assert.equal(trashRetentionDays('9999'), 365);
  assert.equal(trashPurgeBatchSize('0'), 1);
  assert.equal(trashPurgeBatchSize('9999'), 500);
  assert.equal(trashCutoff({ now: new Date('2026-07-31T00:00:00.000Z'), retentionDays: 30 }).toISOString(), '2026-07-01T00:00:00.000Z');
});

test('expired trash is atomically claimed and restored when storage deletion fails', async () => {
  const candidates = [
    { _id: 'one', id: 'm1', provider: 's3', storageKey: 'users/u/media/one.jpg', trashed: true, trashedAt: new Date('2026-06-01') },
    { _id: 'two', id: 'm2', provider: 's3', storageKey: 'users/u/media/two.jpg', trashed: true, trashedAt: new Date('2026-06-02') },
  ];
  const claims = [];
  const restored = [];
  const collection = {
    find(filter) {
      assert.equal(filter.trashed, true);
      assert.ok(filter.trashedAt.$lte instanceof Date);
      return {
        sort() { return this; },
        limit(value) { assert.equal(value, 100); return this; },
        async toArray() { return candidates; },
      };
    },
    async findOneAndDelete(filter) {
      claims.push(filter);
      return candidates.find((item) => item._id === filter._id && item.trashedAt === filter.trashedAt) || null;
    },
    async insertOne(document) { restored.push(document); return { insertedId: document._id }; },
  };
  const db = { collection(name) { assert.equal(name, 'media'); return collection; } };
  const storageDeletes = [];
  const result = await purgeExpiredTrash({
    db,
    now: new Date('2026-07-31T00:00:00.000Z'),
    retentionDays: 30,
    deleteStored: async (item) => {
      storageDeletes.push(item.storageKey);
      if (item.storageKey.endsWith('two.jpg')) throw new Error('S3 unavailable');
    },
  });

  assert.deepEqual(storageDeletes, ['users/u/media/one.jpg', 'users/u/media/two.jpg']);
  assert.equal(claims.length, 2);
  assert.equal(claims[0].trashedAt, candidates[0].trashedAt);
  assert.equal(restored.length, 1);
  assert.equal(restored[0]._id, 'two');
  assert.equal(restored[0].trashed, true);
  assert.equal(result.claimed, 2);
  assert.equal(result.purged, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.failures[0].recordRestored, true);
});

test('a restored or re-trashed row cannot be claimed from a stale candidate', async () => {
  const candidate = { _id: 'one', id: 'm1', provider: 's3', storageKey: 'one.jpg', trashed: true, trashedAt: new Date('2026-06-01') };
  let storageCalled = false;
  const collection = {
    find() { return { sort() { return this; }, limit() { return this; }, async toArray() { return [candidate]; } }; },
    async findOneAndDelete() { return null; },
    async insertOne() { throw new Error('must not restore an unclaimed row'); },
  };
  const result = await purgeExpiredTrash({
    db: { collection() { return collection; } },
    now: new Date('2026-07-31T00:00:00.000Z'),
    deleteStored: async () => { storageCalled = true; },
  });
  assert.equal(storageCalled, false);
  assert.equal(result.claimed, 0);
  assert.equal(result.purged, 0);
});
