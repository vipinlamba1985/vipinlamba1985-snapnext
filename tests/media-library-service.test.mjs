import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MediaLibraryServiceError,
  applyBulkMediaAction,
  applyMediaAction,
  createTextMedia,
  decodeMediaCursor,
  encodeMediaCursor,
  escapeSearchPattern,
  normalizeMediaFilter,
} from '../lib/media-library-service.js';

test('media filters fail safely to all', () => {
  assert.equal(normalizeMediaFilter('photo'), 'photo');
  assert.equal(normalizeMediaFilter('TRASH'), 'trash');
  assert.equal(normalizeMediaFilter('unexpected'), 'all');
});

test('media search escapes regex syntax and caps input length', () => {
  assert.equal(escapeSearchPattern('family.*(trip)?'), 'family\\.\\*\\(trip\\)\\?');
  assert.equal(escapeSearchPattern('x'.repeat(200)).length, 120);
});

test('gallery cursors preserve stable createdAt and id ordering', () => {
  const createdAt = new Date('2026-07-24T10:00:00.000Z');
  const cursor = encodeMediaCursor({ id: 'media-42', createdAt });
  assert.deepEqual(decodeMediaCursor(cursor), { id: 'media-42', createdAt });
  assert.equal(decodeMediaCursor('not-a-cursor'), null);
});

test('single media actions scope reads and writes to the authenticated user', async () => {
  let readFilter = null;
  let writeFilter = null;
  const db = {
    collection(name) {
      assert.equal(name, 'media');
      return {
        findOne: async filter => { readFilter = filter; return { id: 'm1', userId: 'u1', favorite: false }; },
        updateOne: async filter => { writeFilter = filter; },
      };
    },
  };

  await applyMediaAction({ db, userId: 'u1', id: 'm1', action: 'favorite' });
  assert.deepEqual(readFilter, { id: 'm1', userId: 'u1' });
  assert.deepEqual(writeFilter, { id: 'm1', userId: 'u1' });
});

test('unsupported media actions fail before database work', async () => {
  await assert.rejects(
    () => applyMediaAction({ db: null, userId: 'u1', id: 'm1', action: 'publish' }),
    error => error instanceof MediaLibraryServiceError && error.code === 'media_action_invalid',
  );
});

test('bulk actions reject oversized or malformed selections', async () => {
  await assert.rejects(
    () => applyBulkMediaAction({
      db: null,
      userId: 'u1',
      body: { action: 'trash', ids: Array.from({ length: 501 }, (_, i) => `m${i}`) },
    }),
    error => error instanceof MediaLibraryServiceError && error.code === 'media_bulk_invalid',
  );
});

test('quick text capture creates a user-owned media document', async () => {
  let inserted = null;
  const db = {
    collection(name) {
      assert.equal(name, 'media');
      return { insertOne: async doc => { inserted = doc; } };
    },
  };

  const item = await createTextMedia({
    db,
    userId: 'u1',
    body: { text: 'A useful memory', title: 'Note', tags: ['idea'], category: 'Knowledge' },
  });

  assert.equal(inserted.userId, 'u1');
  assert.equal(inserted.kind, 'text');
  assert.equal(inserted.aiAnalysis.caption, 'A useful memory');
  assert.equal(item.userId, 'u1');
  assert.equal('_id' in item, false);
});
