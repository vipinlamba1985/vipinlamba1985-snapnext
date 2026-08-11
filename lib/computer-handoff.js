import crypto from 'node:crypto';

export const COMPUTER_HANDOFF_TTL_MS = 5 * 60 * 1000;
export const COMPUTER_HANDOFF_ACTIVE_STATUSES = ['pending', 'claimed', 'approved'];

const PAIR_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const OPAQUE_ID_BYTES = 24;
const CREATOR_SECRET_BYTES = 32;

export function createOpaqueHandoffId() {
  return crypto.randomBytes(OPAQUE_ID_BYTES).toString('base64url');
}

export function createCreatorSecret() {
  return crypto.randomBytes(CREATOR_SECRET_BYTES).toString('base64url');
}

export function hashCreatorSecret(secret) {
  return crypto.createHash('sha256').update(String(secret || ''), 'utf8').digest('hex');
}

export function creatorSecretMatches(secret, expectedHash) {
  if (!secret || !expectedHash) return false;
  const actual = Buffer.from(hashCreatorSecret(secret), 'hex');
  const expected = Buffer.from(String(expectedHash), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createPairCode() {
  let raw = '';
  for (let index = 0; index < 8; index += 1) {
    raw += PAIR_ALPHABET[crypto.randomInt(0, PAIR_ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizePairCode(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 8) return null;
  if ([...raw].some((character) => !PAIR_ALPHABET.includes(character))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function createVerificationCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function formatVerificationCode(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 6).padStart(6, '0');
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

export function handoffExpiresAt(now = new Date()) {
  return new Date(now.getTime() + COMPUTER_HANDOFF_TTL_MS);
}

export function isHandoffExpired(session, now = new Date()) {
  if (!session?.expiresAt) return true;
  return new Date(session.expiresAt).getTime() <= now.getTime();
}

export function publicHandoffState(session) {
  if (!session) return null;
  const revealCode = ['claimed', 'approved', 'consumed'].includes(session.status);
  return {
    id: session.id,
    status: session.status,
    pairCode: session.pairCode,
    verificationCode: revealCode ? formatVerificationCode(session.verificationCode) : null,
    expiresAt: new Date(session.expiresAt).toISOString(),
    claimedAt: session.claimedAt ? new Date(session.claimedAt).toISOString() : null,
    approvedAt: session.approvedAt ? new Date(session.approvedAt).toISOString() : null,
    consumedAt: session.consumedAt ? new Date(session.consumedAt).toISOString() : null,
  };
}
