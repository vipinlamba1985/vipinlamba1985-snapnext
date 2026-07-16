'use client';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes) {
  const binary = Array.from(new Uint8Array(bytes), byte => String.fromCharCode(byte)).join('');
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(String(value || ''));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export async function generateDeviceKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  return { publicJwk, privateJwk };
}

export async function importDevicePrivateKey(privateJwk) {
  return crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
}

export async function importDevicePublicKey(publicJwk) {
  return crypto.subtle.importKey(
    'jwk',
    publicJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
}

export async function generateConversationKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportConversationKey(key) {
  return toBase64(await crypto.subtle.exportKey('raw', key));
}

export async function importConversationKey(rawBase64) {
  return crypto.subtle.importKey(
    'raw',
    fromBase64(rawBase64),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function deriveWrappingKey(privateKey, publicKey, context) {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256,
  );
  const hkdfMaterial = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: context,
      info: encoder.encode('snapnext-chat-key-wrap'),
    },
    hkdfMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function wrapConversationKey({ conversationKey, senderPrivateJwk, recipientPublicJwk, threadId, keyVersion = 1 }) {
  const privateKey = await importDevicePrivateKey(senderPrivateJwk);
  const publicKey = await importDevicePublicKey(recipientPublicJwk);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const context = encoder.encode(`snapnext:e2ee:thread:${threadId}:v${keyVersion}`);
  const key = await deriveWrappingKey(privateKey, publicKey, context);
  const rawConversationKey = await crypto.subtle.exportKey('raw', conversationKey);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context }, key, rawConversationKey);
  return {
    algorithm: 'ECDH-P256+HKDF-SHA256+A256GCM',
    keyVersion,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
}

export async function unwrapConversationKey({ envelope, recipientPrivateJwk, senderPublicJwk, threadId }) {
  const privateKey = await importDevicePrivateKey(recipientPrivateJwk);
  const publicKey = await importDevicePublicKey(senderPublicJwk);
  const context = encoder.encode(`snapnext:e2ee:thread:${threadId}:v${envelope.keyVersion}`);
  const key = await deriveWrappingKey(privateKey, publicKey, context);
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: context },
    key,
    fromBase64(envelope.ciphertext),
  );
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptChatPayload({ conversationKey, threadId, senderDeviceId, keyVersion = 1, payload }) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(`snapnext:message:${threadId}:${senderDeviceId}:v${keyVersion}`);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, conversationKey, plaintext);
  return {
    version: 1,
    algorithm: 'A256GCM',
    keyVersion,
    senderDeviceId,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
}

export async function decryptChatPayload({ conversationKey, threadId, envelope }) {
  const aad = encoder.encode(`snapnext:message:${threadId}:${envelope.senderDeviceId}:v${envelope.keyVersion}`);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: aad },
    conversationKey,
    fromBase64(envelope.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext));
}

export function isEncryptedEnvelope(value) {
  return Boolean(value && value.algorithm === 'A256GCM' && value.ciphertext && value.iv && value.senderDeviceId);
}
