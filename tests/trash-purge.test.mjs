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

test('expired trash is removed only after strict storage deletion succeeds', async () => {
  const deletedFilters = [];
  const candidates = [
    { _id: 'one', id: 'm1', provider: 's3', storageKey: 'users/u/media/one.jpg', trashed: true, trashedAt: new Date('2026-06-01') },
    { _id: 'two', id: 'm2', provider: 's3', storageKey: 'users/u/media/two.jpg', trashed: true, trashedAt: new Date('2026-06-02') },
  ];
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
    async deleteOne(filter) { deletedFilters.push(filter); return { deletedCount: 1 }; },
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
  assert.equal(deletedFilters.length, 1);
  assert.equal(deletedFilters[0]._id, 'one');
  assert.equal(result.purged, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.failures[0].id, 'm2');
});
