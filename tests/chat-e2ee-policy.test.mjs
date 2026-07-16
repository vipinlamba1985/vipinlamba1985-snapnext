import test from 'node:test';
import assert from 'node:assert/strict';
import { canShowEncryptionBadge, isChatE2eeEnabled, isValidEncryptedEnvelope } from '../lib/chat-e2ee-policy.js';

test('E2EE remains disabled unless explicitly enabled', () => {
  assert.equal(isChatE2eeEnabled({}), false);
  assert.equal(isChatE2eeEnabled({ CHAT_E2EE_ENABLED: 'false' }), false);
  assert.equal(isChatE2eeEnabled({ CHAT_E2EE_ENABLED: 'true' }), true);
  assert.equal(isChatE2eeEnabled({ CHAT_E2EE_ENABLED: 'TRUE' }), true);
});

test('validates ciphertext envelopes and rejects plaintext-shaped payloads', () => {
  const valid = {
    version: 1,
    algorithm: 'A256GCM',
    keyVersion: 1,
    senderDeviceId: 'device-1',
    iv: 'base64-iv',
    ciphertext: 'base64-ciphertext',
  };
  assert.equal(isValidEncryptedEnvelope(valid), true);
  assert.equal(isValidEncryptedEnvelope({ ...valid, ciphertext: '' }), false);
  assert.equal(isValidEncryptedEnvelope({ content: 'plaintext' }), false);
  assert.equal(isValidEncryptedEnvelope({ ...valid, algorithm: 'AES-CBC' }), false);
});

test('encryption badge appears only after a thread is fully ready', () => {
  assert.equal(canShowEncryptionBadge({ encryptionMode: 'e2ee-v1' }), false);
  assert.equal(canShowEncryptionBadge({ encryptionMode: 'e2ee-v1', e2eeReadyAt: new Date() }), true);
  assert.equal(canShowEncryptionBadge({ encryptionMode: 'plaintext', e2eeReadyAt: new Date() }), false);
});
