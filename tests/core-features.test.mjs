import test from 'node:test';
import assert from 'node:assert/strict';

import { encryptCloudToken, decryptCloudToken } from '../lib/cloud-token-crypto.js';
import { ageFromBirthDate, ageBandFor, sanitizeMinorPermissions, validConsentRecord } from '../lib/family-safety.js';
import { canPost, canRead, directChatState, permissionFor } from '../lib/social-chat-policy.js';

test('cloud token encryption round-trips and does not expose plaintext', () => {
  const previous = process.env.CLOUD_CONNECTOR_SECRET;
  process.env.CLOUD_CONNECTOR_SECRET = 'test-secret-that-is-not-used-in-production';
  try {
    const plaintext = 'refresh-token-value';
    const encrypted = encryptCloudToken(plaintext);
    assert.notEqual(encrypted, plaintext);
    assert.equal(encrypted.split('.').length, 3);
    assert.equal(decryptCloudToken(encrypted), plaintext);
  } finally {
    if (previous === undefined) delete process.env.CLOUD_CONNECTOR_SECRET;
    else process.env.CLOUD_CONNECTOR_SECRET = previous;
  }
});

test('minor age calculation and bands honor birthdays', () => {
  const now = new Date('2026-07-16T12:00:00Z');
  assert.equal(ageFromBirthDate('2013-07-17', now), 12);
  assert.equal(ageFromBirthDate('2013-07-16', now), 13);
  assert.equal(ageBandFor(12)?.id, 'under13');
  assert.equal(ageBandFor(14)?.id, '13to15');
  assert.equal(ageBandFor(17)?.id, '16to17');
  assert.equal(ageBandFor(18), null);
});

test('minor permissions cannot enable prohibited public or advertising settings', () => {
  const permissions = sanitizeMinorPermissions({
    publicProfile: true,
    publicCommunities: true,
    unknownContacts: true,
    behavioralAds: true,
    dataSale: true,
    directChat: 'allowed',
    faceRecognition: true,
  });
  assert.equal(permissions.publicProfile, false);
  assert.equal(permissions.publicCommunities, false);
  assert.equal(permissions.unknownContacts, false);
  assert.equal(permissions.behavioralAds, false);
  assert.equal(permissions.dataSale, false);
  assert.equal(permissions.directChat, 'allowed');
  assert.equal(permissions.faceRecognition, true);
});

test('consent records require active, versioned guardian proof', () => {
  assert.equal(validConsentRecord({}), false);
  assert.equal(validConsentRecord({ guardianUserId: 'g1', consentVersion: 'v1', consentedAt: new Date(), method: 'verified', status: 'active' }), true);
  assert.equal(validConsentRecord({ guardianUserId: 'g1', consentVersion: 'v1', consentedAt: new Date(), method: 'verified', status: 'withdrawn' }), false);
});

test('direct chats remain blocked until accepted and then become two-way', () => {
  const thread = { type: 'direct', status: 'pending', memberIds: ['a', 'b'], requestSenderId: 'a', requestRecipientId: 'b' };
  assert.equal(canPost(thread, 'a'), false);
  assert.equal(canPost(thread, 'b'), false);
  assert.deepEqual(directChatState(thread, 'b'), { pending: true, active: false, declined: false, isSender: false, isRecipient: true });
  thread.status = 'active';
  assert.equal(canPost(thread, 'a'), true);
  assert.equal(canPost(thread, 'b'), true);
});

test('community owner controls view-only and posting permissions', () => {
  const thread = {
    type: 'community', ownerId: 'owner', memberIds: ['owner', 'poster', 'viewer'], archivedFor: [],
    memberPermissions: { owner: 'owner', poster: 'post', viewer: 'view' },
  };
  assert.equal(permissionFor(thread, 'owner'), 'owner');
  assert.equal(canPost(thread, 'poster'), true);
  assert.equal(canPost(thread, 'viewer'), false);
  assert.equal(canRead(thread, 'viewer'), true);
  thread.archivedFor.push('viewer');
  assert.equal(canRead(thread, 'viewer'), false);
});
