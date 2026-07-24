import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SharingApiError,
  parseAlbumAction,
  parseAlbumActionInput,
  parseAlbumName,
  parseReactionInput,
  parseShareMemoryInput,
  parseSharePhotosInput,
} from '../lib/sharing/api-contract.js';

test('shared photo input de-duplicates media ids', () => {
  assert.deepEqual(
    parseSharePhotosInput({ recipientUserId: 'user-b', mediaIds: ['m1', 'm1', 'm2'] }),
    { recipientUserId: 'user-b', mediaIds: ['m1', 'm2'] },
  );
});

test('shared photo input requires recipient and at least one media id', () => {
  assert.throws(
    () => parseSharePhotosInput({ recipientUserId: 'user-b', mediaIds: [] }),
    (error) => error instanceof SharingApiError && error.code === 'shared_photos_invalid',
  );
});

test('shared album names are trimmed and bounded', () => {
  assert.deepEqual(parseAlbumName({ name: '  Family Summer  ' }), { name: 'Family Summer' });
  assert.throws(
    () => parseAlbumName({ name: '' }),
    (error) => error instanceof SharingApiError && error.code === 'shared_album_name_required',
  );
});

test('shared album actions are allowlisted and validate their specific payloads', () => {
  assert.equal(parseAlbumAction('invite'), 'invite');
  assert.equal(parseAlbumAction('add-media'), 'add-media');
  assert.throws(
    () => parseAlbumAction('transfer-owner'),
    (error) => error instanceof SharingApiError && error.code === 'shared_album_action_invalid',
  );
  assert.deepEqual(parseAlbumActionInput('invite', { favoriteUserId: 'user-b' }), { favoriteUserId: 'user-b' });
  assert.deepEqual(parseAlbumActionInput('add-media', { mediaIds: ['m1', 'm1'] }), { mediaIds: ['m1'] });
  assert.deepEqual(parseAlbumActionInput('delete', {}), {});
});

test('shared memory input requires owned-media candidates and a title/recipient', () => {
  assert.deepEqual(
    parseShareMemoryInput({ title: ' Our trip ', recipientUserId: 'user-b', mediaIds: ['m1', 'm2', 'm1'] }),
    { title: 'Our trip', recipientUserId: 'user-b', mediaIds: ['m1', 'm2'] },
  );
  assert.throws(
    () => parseShareMemoryInput({ title: '', recipientUserId: 'user-b', mediaIds: ['m1'] }),
    (error) => error instanceof SharingApiError && error.code === 'shared_memory_invalid',
  );
});

test('memory reactions default to heart and reject oversized payloads', () => {
  assert.deepEqual(parseReactionInput({}), { emoji: '❤️' });
  assert.deepEqual(parseReactionInput({ emoji: '👏' }), { emoji: '👏' });
  assert.throws(
    () => parseReactionInput({ emoji: 'x'.repeat(25) }),
    (error) => error instanceof SharingApiError && error.code === 'shared_memory_reaction_invalid',
  );
});
