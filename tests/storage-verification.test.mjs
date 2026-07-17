import test from 'node:test';
import assert from 'node:assert/strict';
import { assertVerifiedObject } from '../lib/storage-verification.js';

test('accepts matching object metadata', () => {
  const result = assertVerifiedObject({
    expectedSize: 128,
    expectedContentType: 'image/jpeg',
    actualSize: 128,
    actualContentType: 'image/jpeg',
    storageKey: 'users/u/media/m/photo.jpg',
  });
  assert.equal(result.verified, true);
});

test('rejects an object with the wrong size', () => {
  assert.throws(() => assertVerifiedObject({
    expectedSize: 128,
    expectedContentType: 'image/jpeg',
    actualSize: 127,
    actualContentType: 'image/jpeg',
    storageKey: 'users/u/media/m/photo.jpg',
  }), /expected 128 bytes but found 127/);
});

test('rejects an object with the wrong content type', () => {
  assert.throws(() => assertVerifiedObject({
    expectedSize: 128,
    expectedContentType: 'image/jpeg',
    actualSize: 128,
    actualContentType: 'application/octet-stream',
    storageKey: 'users/u/media/m/photo.jpg',
  }), /expected image\/jpeg but found application\/octet-stream/);
});
