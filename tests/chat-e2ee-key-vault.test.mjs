import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const vaultSource = fs.readFileSync(new URL('../lib/chat-e2ee-key-vault.js', import.meta.url), 'utf8');
const sessionSource = fs.readFileSync(new URL('../lib/chat-e2ee-session.js', import.meta.url), 'utf8');

test('web E2EE vault uses a non-exportable AES-GCM vault key', () => {
  assert.match(vaultSource, /AES-GCM/);
  assert.match(vaultSource, /length:\s*256/);
  assert.match(vaultSource, /false,\s*\['encrypt', 'decrypt'\]/);
});

test('private device key is encrypted before IndexedDB storage', () => {
  assert.match(vaultSource, /encryptedPrivateJwk/);
  assert.match(vaultSource, /crypto\.subtle\.encrypt/);
  assert.doesNotMatch(vaultSource, /privateJwk:\s*privateJwk/);
});

test('server registration receives public key only', () => {
  const registration = sessionSource.slice(sessionSource.indexOf("apiFetch('/chat-e2ee/devices'"));
  assert.match(registration, /publicJwk/);
  assert.doesNotMatch(registration, /privateJwk/);
});

test('status never claims E2EE before device and thread readiness', () => {
  assert.match(sessionSource, /if \(!deviceReady\)/);
  assert.match(sessionSource, /if \(!threadReady\)/);
  assert.match(sessionSource, /End-to-end encrypted/);
});
