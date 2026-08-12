import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FAMILY_WATCH_MAX_ITEMS,
  createFamilyWatchPairCode,
  createFamilyWatchSecret,
  familyWatchSecretMatches,
  hashFamilyWatchSecret,
  normalizeFamilyWatchMediaIds,
  normalizeFamilyWatchPairCode,
} from '../lib/family-watch.js';

const controller = fs.readFileSync(new URL('../app/api/family-watch/route.js', import.meta.url), 'utf8');
const viewer = fs.readFileSync(new URL('../app/api/family-watch/public/route.js', import.meta.url), 'utf8');
const media = fs.readFileSync(new URL('../app/api/family-watch/media/route.js', import.meta.url), 'utf8');
const watchPage = fs.readFileSync(new URL('../app/watch/page.js', import.meta.url), 'utf8');
const launcher = fs.readFileSync(new URL('../components/family/FamilyWatchLauncher.js', import.meta.url), 'utf8');
const memoriesRoute = fs.readFileSync(new URL('../app/api/memories/route.js', import.meta.url), 'utf8');
const dashboardLayout = fs.readFileSync(new URL('../app/(app)/dashboard/layout.js', import.meta.url), 'utf8');
const storyLayout = fs.readFileSync(new URL('../app/(app)/memory-stories/layout.js', import.meta.url), 'utf8');

test('family watch pairing codes are human-safe and normalized', () => {
  const code = createFamilyWatchPairCode();
  assert.match(code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  assert.equal(normalizeFamilyWatchPairCode(code.toLowerCase()), code);
  assert.equal(normalizeFamilyWatchPairCode('bad'), null);
});

test('family watch secrets are hashed and compared without storing raw controller proof', () => {
  const secret = createFamilyWatchSecret();
  const hash = hashFamilyWatchSecret(secret);
  assert.notEqual(secret, hash);
  assert.equal(familyWatchSecretMatches(secret, hash), true);
  assert.equal(familyWatchSecretMatches(`${secret}x`, hash), false);
});

test('family watch media selection is deduplicated and capped', () => {
  const values = Array.from({ length: FAMILY_WATCH_MAX_ITEMS + 10 }, (_, index) => `media-${index}`);
  const result = normalizeFamilyWatchMediaIds([...values, values[0], '']);
  assert.equal(result.length, FAMILY_WATCH_MAX_ITEMS);
  assert.equal(new Set(result).size, result.length);
});

test('controller creation verifies signed-in ownership before a story can be watched', () => {
  assert.match(controller, /getUserFromRequest\(request\)/);
  assert.match(controller, /userId,/);
  assert.match(controller, /id: \{ \$in: mediaIds \}/);
  assert.match(controller, /trashed: \{ \$ne: true \}/);
  assert.match(controller, /kind: \{ \$in: \['photo', 'video'\] \}/);
  assert.match(controller, /creatorSecretHash/);
  assert.match(controller, /familyWatchSecretMatches\(body\?\.creatorSecret/);
});

test('TV pairing is approval-gated and never receives the SnapNext login session', () => {
  assert.doesNotMatch(viewer, /getUserFromRequest|Authorization|sb-access-token|refreshToken/);
  assert.match(viewer, /status: 'claimed'/);
  assert.match(viewer, /viewerSecretHash/);
  assert.match(viewer, /mediaAccessHashes/);
  assert.match(viewer, /session\.status !== 'approved'/);
  assert.doesNotMatch(watchPage, /getToken\(|setToken\(|sb-access-token|snapnext_token|refreshToken/);
  assert.match(watchPage, /Match this code|verificationCode/);
});

test('each family-watch media URL is scoped to one approved session slot', () => {
  assert.match(media, /status: 'approved'/);
  assert.match(media, /expiresAt: \{ \$gt: new Date\(\) \}/);
  assert.match(media, /mediaAccessHashes\?\.\[slot\]/);
  assert.match(media, /familyWatchSecretMatches\(token, expectedHash\)/);
  assert.match(media, /session\.mediaIds\?\.\[slot\]/);
  assert.match(media, /storage\.getReadUrl/);
  assert.match(media, /Referrer-Policy': 'no-referrer'/);
});

test('Family Story is surfaced on Home and grounded Memory Stories without changing primary navigation', () => {
  assert.match(dashboardLayout, /FamilyWatchLauncher mode="home"/);
  assert.match(storyLayout, /FamilyWatchLauncher mode="story"/);
  assert.match(launcher, /Watch together/);
  assert.match(launcher, /TV browser, computer, or another large screen/);
  assert.match(launcher, /apiFetch\('\/memories'\)|const path = mode === 'story' \? '\/memory-stories' : '\/memories'/);
  assert.match(launcher, /story\?\.sources/);
});

test('Home story rail is backed by the real grouped memories response', () => {
  assert.match(memoriesRoute, /groups: groupList, onThisDay, stories/);
  assert.match(memoriesRoute, /storyKey: group\.key/);
  assert.match(memoriesRoute, /title: group\.label/);
  assert.match(memoriesRoute, /count: group\.items\.filter/);
});
