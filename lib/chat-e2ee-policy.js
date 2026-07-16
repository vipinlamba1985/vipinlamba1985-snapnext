export const CHAT_E2EE_MODE = 'e2ee-v1';

export function isChatE2eeEnabled(env = process.env) {
  return String(env.CHAT_E2EE_ENABLED || '').toLowerCase() === 'true';
}

export function isValidEncryptedEnvelope(envelope) {
  return Boolean(
    envelope
    && envelope.version === 1
    && envelope.algorithm === 'A256GCM'
    && Number.isInteger(Number(envelope.keyVersion))
    && Number(envelope.keyVersion) > 0
    && typeof envelope.senderDeviceId === 'string'
    && envelope.senderDeviceId.length > 0
    && envelope.senderDeviceId.length <= 120
    && typeof envelope.iv === 'string'
    && envelope.iv.length > 0
    && envelope.iv.length <= 64
    && typeof envelope.ciphertext === 'string'
    && envelope.ciphertext.length > 0
    && envelope.ciphertext.length <= 120000,
  );
}

export function canShowEncryptionBadge(thread) {
  return Boolean(thread?.encryptionMode === CHAT_E2EE_MODE && thread?.e2eeReadyAt);
}
