import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupByDay,
  groupByMemoryDay,
  libraryDate,
  photoDate,
} from '../lib/media-day-groups.js';
import { listUserMedia } from '../lib/media-library-service.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');

test('Library date prefers backup time over an old capture date', () => {
  const item = {
    capturedAt: '2012-03-04T12:00:00.000Z',
    createdAt: '2012-03-04T12:00:00.000Z',
    uploadedAt: '2026-08-05T10:30:00.000Z',
  };

  assert.equal(libraryDate(item).toISOString(), '2026-08-05T10:30:00.000Z');
  assert.equal(photoDate(item).toISOString(), '2012-03-04T12:00:00.000Z');
});

test('an old photo backed up today appears in the Today section of Library All', () => {
  const groups = groupByDay([
    {
      id: 'old-photo-new-backup',
      capturedAt: '2012-03-04T12:00:00.000Z',
      createdAt: '2012-03-04T12:00:00.000Z',
      uploadedAt: '2026-08-05T10:30:00.000Z',
    },
  ], NOW);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, 'Today');
  assert.equal(groups[0].items[0].id, 'old-photo-new-backup');
});

test('capture-date grouping remains available for chronological memory views', () => {
  const groups = groupByMemoryDay([
    {
      id: 'old-photo-new-backup',
      capturedAt: '2012-03-04T12:00:00.000Z',
      uploadedAt: '2026-08-05T10:30:00.000Z',
    },
  ], NOW);

  assert.match(groups[0].title, /2012/);
});

test('the media query selects recent backups before applying the 500 item limit', async () => {
  let sortSpec = null;
  let limitValue = null;
  let queryValue = null;

  const cursor = {
    sort(value) {
      sortSpec = value;
      return this;
    },
    limit(value) {
      limitValue = value;
      return this;
    },
    async toArray() {
      return [{ _id: 'mongo-only', id: 'visible' }];
    },
  };
  const db = {
    collection(name) {
      assert.equal(name, 'media');
      return {
        find(query) {
          queryValue = query;
          return cursor;
        },
      };
    },
  };

  const items = await listUserMedia({ db, userId: 'user-1', limit: 500 });

  assert.deepEqual(queryValue, { userId: 'user-1', trashed: { $ne: true } });
  assert.deepEqual(sortSpec, { uploadedAt: -1, createdAt: -1, _id: -1 });
  assert.equal(limitValue, 500);
  assert.deepEqual(items, [{ id: 'visible' }]);
});
