import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FavoritesApiError,
  buildMutualAlbumMembershipFilter,
  defaultFavoritePermissions,
  parseFavoriteAction,
  parseFavoriteInvite,
  parsePermissionUpdate,
} from '../lib/favorites/api-contract.js';

test('favorite invite normalizes a valid email', () => {
  assert.deepEqual(parseFavoriteInvite({ email: ' Friend@Example.COM ' }), { email: 'friend@example.com' });
});

test('favorite invite rejects invalid email and empty requests', () => {
  assert.throws(
    () => parseFavoriteInvite({ email: 'not-email' }),
    (error) => error instanceof FavoritesApiError && error.code === 'favorite_email_invalid',
  );
  assert.throws(
    () => parseFavoriteInvite({}),
    (error) => error instanceof FavoritesApiError && error.code === 'favorite_email_required',
  );
});

test('favorite actions are allowlisted', () => {
  assert.equal(parseFavoriteAction('accept'), 'accept');
  assert.equal(parseFavoriteAction('remove'), 'remove');
  assert.throws(
    () => parseFavoriteAction('delete-everything'),
    (error) => error instanceof FavoritesApiError && error.code === 'favorite_action_invalid',
  );
});

test('permission updates accept only known boolean sharing controls', () => {
  assert.deepEqual(
    parsePermissionUpdate({ shareAlbums: false, shareFuturePhotos: true, unexpected: true }),
    { shareAlbums: false, shareFuturePhotos: true },
  );
  assert.throws(
    () => parsePermissionUpdate({ shareAlbums: 'yes' }),
    (error) => error instanceof FavoritesApiError && error.code === 'favorite_permissions_invalid',
  );
});

test('default permissions keep future auto-sharing off', () => {
  const permissions = defaultFavoritePermissions();
  assert.equal(permissions.shareSharedPhotos, true);
  assert.equal(permissions.shareAlbums, true);
  assert.equal(permissions.shareMemories, true);
  assert.equal(permissions.shareProfilePicture, true);
  assert.equal(permissions.shareFuturePhotos, false);
});

test('favorite removal only revokes album memberships between the two people', () => {
  assert.deepEqual(
    buildMutualAlbumMembershipFilter({
      userId: 'user-a',
      otherId: 'user-b',
      userAlbumIds: ['a-1', 'a-2'],
      otherAlbumIds: ['b-1'],
    }),
    {
      $or: [
        { albumId: { $in: ['a-1', 'a-2'] }, favoriteUserId: 'user-b' },
        { albumId: { $in: ['b-1'] }, favoriteUserId: 'user-a' },
      ],
    },
  );
});

test('favorite removal uses an impossible album filter when neither user owns albums', () => {
  assert.deepEqual(
    buildMutualAlbumMembershipFilter({ userId: 'user-a', otherId: 'user-b' }),
    { albumId: { $in: [] } },
  );
});
