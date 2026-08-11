import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  COMPUTER_HANDOFF_TTL_MS,
  createCreatorSecret,
  createOpaqueHandoffId,
  createPairCode,
  createVerificationCode,
  creatorSecretMatches,
  formatVerificationCode,
  handoffExpiresAt,
  hashCreatorSecret,
  normalizePairCode,
  publicHandoffState,
} from '../lib/computer-handoff.js';

const apiSource = fs.readFileSync(new URL('../app/api/computer-handoff/route.js', import.meta.url), 'utf8');
const mobileSource = fs.readFileSync(new URL('../components/upload/ContinueOnComputer.js', import.meta.url), 'utf8');
const desktopSource = fs.readFileSync(new URL('../app/connect/page.js', import.meta.url), 'utf8');
const addPageSource = fs.readFileSync(new URL('../app/(app)/upload/discover/page.js', import.meta.url), 'utf8');

test('computer handoff sessions expire after five minutes', () => {
  assert.equal(COMPUTER_HANDOFF_TTL_MS, 5 * 60 * 1000);
  const now = new Date('2026-08-11T17:00:00.000Z');
  assert.equal(handoffExpiresAt(now).toISOString(), '2026-08-11T17:05:00.000Z');
});

test('pair codes are human-readable, normalized and avoid ambiguous characters', () => {
  const code = createPairCode();
  assert.match(code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  assert.equal(normalizePairCode(code.toLowerCase().replace('-', ' ')), code);
  assert.equal(normalizePairCode('O0I1-ABCD'), null);
});

test('handoff IDs and creator proof are opaque and creator proof is timing-safe verified', () => {
  const id = createOpaqueHandoffId();
  const secret = createCreatorSecret();
  assert.match(id, /^[A-Za-z0-9_-]{32}$/);
  assert.ok(secret.length >= 40);
  const digest = hashCreatorSecret(secret);
  assert.equal(digest.length, 64);
  assert.equal(creatorSecretMatches(secret, digest), true);
  assert.equal(creatorSecretMatches(`${secret}x`, digest), false);
});

test('verification codes are short display-only codes', () => {
  const code = createVerificationCode();
  assert.match(code, /^\d{6}$/);
  assert.match(formatVerificationCode(code), /^\d{3} \d{3}$/);
});

test('public session state hides verification until a computer has claimed it', () => {
  const base = {
    id: 'a'.repeat(32),
    pairCode: 'ABCD-EFGH',
    verificationCode: '123456',
    expiresAt: new Date('2026-08-11T17:05:00.000Z'),
  };
  assert.equal(publicHandoffState({ ...base, status: 'pending' }).verificationCode, null);
  assert.equal(publicHandoffState({ ...base, status: 'claimed' }).verificationCode, '123 456');
  assert.equal('creatorSecretHash' in publicHandoffState({ ...base, status: 'claimed' }), false);
});

test('claim is same-account, pending-only and unexpired', () => {
  assert.match(apiSource, /pairCode,\s*userId: user\.id,\s*status: 'pending',\s*expiresAt: \{ \$gt: now \}/s);
  assert.match(apiSource, /findOneAndUpdate/);
  assert.match(apiSource, /status: 'claimed'/);
});

test('phone creator proof is required for approval and cancellation', () => {
  assert.match(apiSource, /creatorSecretMatches\(body\?\.creatorSecret, session\.creatorSecretHash\)/);
  assert.match(apiSource, /action === 'approve' \|\| action === 'cancel'/);
  assert.match(apiSource, /status !== 'claimed'/);
  assert.match(apiSource, /status: 'approved'/);
});

test('approved handoff is consumed once before desktop upload opens', () => {
  assert.match(apiSource, /action === 'consume'/);
  assert.match(apiSource, /status: 'approved'/);
  assert.match(apiSource, /status: 'consumed'/);
  assert.match(apiSource, /uploadPath: '\/upload\/discover\?continued=computer'/);
});

test('handoff link contains no login token or creator proof', () => {
  assert.match(apiSource, /connectUrl: `\$\{appUrl\}\/connect`/);
  assert.doesNotMatch(apiSource, /connectUrl:[^\n]*(token|creatorSecret|proof)/i);
  assert.doesNotMatch(mobileSource, /api\.qrserver|chart\.google|quickchart|jsdelivr/i);
});

test('mobile Add exposes explicit Continue on computer pairing and phone approval', () => {
  assert.match(addPageSource, /ContinueOnComputer/);
  assert.match(mobileSource, /data-testid="continue-on-computer"/);
  assert.match(mobileSource, /Continue on computer/);
  assert.match(mobileSource, /snapnext\.ai\/connect/);
  assert.match(mobileSource, /Codes match — approve computer/);
  assert.match(mobileSource, /No photos pass through this phone/);
  assert.match(mobileSource, /md:hidden/);
});

test('desktop preserves the short code through sign-in without putting it in the URL', () => {
  assert.match(desktopSource, /window\.sessionStorage\.setItem\(STORED_PAIR_CODE/);
  assert.match(desktopSource, /href="\/login\?next=\/connect"/);
  assert.match(desktopSource, /same SnapNext account/);
  assert.match(desktopSource, /Approve only if your phone shows this exact code/);
  assert.doesNotMatch(desktopSource, /searchParams.*pair|\?code=|\?token=/i);
});

test('pairing API is rate limited per signed-in user and stores no file names', () => {
  assert.match(apiSource, /computer-handoff:\$\{userId\}/);
  assert.match(apiSource, /limit: 24/);
  assert.doesNotMatch(apiSource, /fileName|filename|mediaId|photoId/);
});
