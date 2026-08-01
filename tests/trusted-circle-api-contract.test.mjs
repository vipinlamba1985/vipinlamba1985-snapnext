import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TrustedCircleApiError,
  buildMutualAlbumMembershipFilter,
  defaultTrustedCirclePermissions,
  parseTrustedCircleAction,
  parseTrustedCircleInvite,
  parsePermissionUpdate,
} from '../lib/trusted-circle/api-contract.js';

test('trusted circle invite normalizes a valid email', () => {
  assert.deepEqual(parseTrustedCircleInvite({ email: ' Friend@Example.COM ' }), { email: 'friend@example.com' });
});

test('trusted circle invite rejects invalid email and empty requests', () => {
  assert.throws(
    () => parseTrustedCircleInvite({ email: 'not-email' }),
    (error) => error instanceof TrustedCircleApiError && error.code === 'trusted_email_invalid',
  );
  assert.throws(
    () => parseTrustedCircleInvite({}),
    (error) => error instanceof TrustedCircleApiError && error.code === 'trusted_email_required',
  );
});

test('trusted circle actions are allowlisted', () => {
  assert.equal(parseTrustedCircleAction('accept'), 'accept');
  assert.equal(parseTrustedCircleAction('remove'), 'remove');
  assert.throws(
    () => parseTrustedCircleAction('delete-everything'),
    (error) => error instanceof TrustedCircleApiError && error.code === 'trusted_action_invalid',
  );
});

test('permission updates accept only known boolean sharing controls', () => {
  assert.deepEqual(
    parsePermissionUpdate({ shareAlbums: false, shareFuturePhotos: true, unexpected: true }),
    { shareAlbums: false, shareFuturePhotos: true },
  );
  assert.throws(
    () => parsePermissionUpdate({ shareAlbums: 'yes' }),
    (error) => error instanceof TrustedCircleApiError && error.code === 'trusted_permissions_invalid',
  );
});

test('default permissions keep future auto-sharing off', () => {
  const permissions = defaultTrustedCirclePermissions();
  assert.equal(permissions.shareSharedPhotos, true);
  assert.equal(permissions.shareAlbums, true);
  assert.equal(permissions.shareMemories, true);
  assert.equal(permissions.shareProfilePicture, true);
  assert.equal(permissions.shareFuturePhotos, false);
});

test('trusted circle removal only revokes album memberships between the two people', () => {
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

test('trusted circle removal uses an impossible album filter when neither user owns albums', () => {
  assert.deepEqual(
    buildMutualAlbumMembershipFilter({ userId: 'user-a', otherId: 'user-b' }),
    { albumId: { $in: [] } },
  );
});
