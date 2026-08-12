import crypto from 'node:crypto';

export const FAMILY_WATCH_PAIR_TTL_MS = 5 * 60 * 1000;
export const FAMILY_WATCH_SESSION_TTL_MS = 60 * 60 * 1000;
export const FAMILY_WATCH_MAX_ITEMS = 40;

const PAIR_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const OPAQUE_ID_BYTES = 24;
const SECRET_BYTES = 32;

export function createFamilyWatchId() {
  return crypto.randomBytes(OPAQUE_ID_BYTES).toString('base64url');
}

export function createFamilyWatchSecret() {
  return crypto.randomBytes(SECRET_BYTES).toString('base64url');
}

export function hashFamilyWatchSecret(secret) {
  return crypto.createHash('sha256').update(String(secret || ''), 'utf8').digest('hex');
}

export function familyWatchSecretMatches(secret, expectedHash) {
  if (!secret || !expectedHash) return false;
  const actual = Buffer.from(hashFamilyWatchSecret(secret), 'hex');
  const expected = Buffer.from(String(expectedHash), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createFamilyWatchPairCode() {
  let raw = '';
  for (let index = 0; index < 8; index += 1) raw += PAIR_ALPHABET[crypto.randomInt(0, PAIR_ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizeFamilyWatchPairCode(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 8 || [...raw].some((character) => !PAIR_ALPHABET.includes(character))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function createFamilyWatchVerificationCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function formatFamilyWatchVerificationCode(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 6).padStart(6, '0');
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

export function familyWatchPairExpiresAt(now = new Date()) {
  return new Date(now.getTime() + FAMILY_WATCH_PAIR_TTL_MS);
}

export function familyWatchSessionExpiresAt(now = new Date()) {
  return new Date(now.getTime() + FAMILY_WATCH_SESSION_TTL_MS);
}

export function normalizeFamilyWatchMediaIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, FAMILY_WATCH_MAX_ITEMS);
}

export function safeFamilyWatchTitle(value) {
  return String(value || 'Family memories').trim().replace(/\s+/g, ' ').slice(0, 120) || 'Family memories';
}

export function publicFamilyWatchControllerState(session) {
  if (!session) return null;
  const showVerification = ['claimed', 'approved', 'ended'].includes(session.status);
  return {
    id: session.id,
    status: session.status,
    pairCode: session.pairCode,
    verificationCode: showVerification ? formatFamilyWatchVerificationCode(session.verificationCode) : null,
    title: session.title,
    itemCount: session.mediaIds?.length || 0,
    playback: session.playback || { index: 0, playing: true },
    claimExpiresAt: session.claimExpiresAt ? new Date(session.claimExpiresAt).toISOString() : null,
    expiresAt: session.expiresAt ? new Date(session.expiresAt).toISOString() : null,
    claimedAt: session.claimedAt ? new Date(session.claimedAt).toISOString() : null,
    approvedAt: session.approvedAt ? new Date(session.approvedAt).toISOString() : null,
    viewerReadyAt: session.viewerReadyAt ? new Date(session.viewerReadyAt).toISOString() : null,
  };
}
