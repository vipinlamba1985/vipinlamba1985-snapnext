import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAccountDeletionFilters,
  buildAccountReferenceQueries,
  extractReferenceIds,
} from '../lib/account-deletion-plan.js';

test('account deletion reference queries cover current and legacy relationship schemas', () => {
  const queries = buildAccountReferenceQueries('user-1');
  assert.deepEqual(queries.favorites.$or, [
    { requesterUserId: 'user-1' },
    { targetUserId: 'user-1' },
    { userId: 'user-1' },
    { otherId: 'user-1' },
  ]);
  assert.deepEqual(queries.ownedAlbums.$or, [
    { ownerUserId: 'user-1' },
    { ownerId: 'user-1' },
  ]);
  assert.deepEqual(queries.sharedMemories.$or, [
    { ownerUserId: 'user-1' },
    { recipientUserId: 'user-1' },
    { ownerId: 'user-1' },
    { userId: 'user-1' },
  ]);
});

test('account deletion filters remove current shared data and referenced child rows', () => {
  const filters = buildAccountDeletionFilters({
    userId: 'user-1',
    favoriteIds: ['fav-1', 'fav-1', 'fav-2'],
    ownedAlbumIds: ['album-1'],
    sharedMemoryIds: ['memory-1'],
  });

  assert.deepEqual(filters.sharedPhotos.$or.slice(0, 2), [
    { ownerUserId: 'user-1' },
    { recipientUserId: 'user-1' },
  ]);
  assert.deepEqual(filters.favoritePermissions.$or.at(-1), {
    favoriteId: { $in: ['fav-1', 'fav-2'] },
  });
  assert.deepEqual(filters.sharedAlbumMedia, { albumId: { $in: ['album-1'] } });
  assert.deepEqual(filters.sharedAlbumMembers.$or.at(-1), { albumId: { $in: ['album-1'] } });
  assert.deepEqual(filters.memoryReactions.$or.at(-1), { sharedMemoryId: { $in: ['memory-1'] } });
  assert.deepEqual(filters.exportJobs, { userId: 'user-1' });
  assert.deepEqual(filters.subscriptions, { userId: 'user-1' });
  assert.deepEqual(filters.chatDevices, { userId: 'user-1' });
  assert.deepEqual(filters.chatMessages, { senderId: 'user-1' });
});

test('account deletion child filters fail safely when no referenced rows exist', () => {
  const filters = buildAccountDeletionFilters({ userId: 'user-1' });
  assert.deepEqual(filters.sharedAlbumMedia, { albumId: { $in: [] } });
  assert.deepEqual(filters.favoritePermissions.$or, [
    { ownerUserId: 'user-1' },
    { favoriteUserId: 'user-1' },
  ]);
  assert.deepEqual(filters.memoryReactions.$or, [{ userId: 'user-1' }]);
});

test('reference id extraction de-duplicates and drops empty values', () => {
  assert.deepEqual(
    extractReferenceIds([{ id: 'a' }, { id: 'a' }, { id: '' }, {}, { id: 'b' }]),
    ['a', 'b'],
  );
});

test('account deletion requires an authenticated user id', () => {
  assert.throws(() => buildAccountDeletionFilters({}), /User id is required/);
});
