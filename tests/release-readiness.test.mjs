import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateLifeGptCitations, averageMatchConfidence } from '../lib/lifegpt-trust.js';
import { PLANS, canUseAiFeature, getPlan } from '../lib/plans.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

test('LifeGPT accepts only valid grounded citations', () => {
  assert.equal(validateLifeGptCitations('A grounded answer [1] and [2].', 2).valid, true);
  assert.equal(validateLifeGptCitations('No sources included.', 2).valid, false);
  assert.equal(validateLifeGptCitations('Invented source [3].', 2).valid, false);
  assert.deepEqual(validateLifeGptCitations('Repeated [1] and [1].', 1).citations, [1]);
});

test('LifeGPT confidence aggregation is deterministic', () => {
  assert.equal(averageMatchConfidence([]), 0);
  assert.equal(averageMatchConfidence([{ confidence: 90 }, { confidence: 80 }, { confidence: 70 }]), 80);
});

test('paid plan limits increase monotonically and free fallback is safe', () => {
  const ordered = ['free', 'plus', 'pro', 'family'];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = PLANS[ordered[index - 1]];
    const current = PLANS[ordered[index]];
    assert.ok(current.storageBytes > previous.storageBytes, `${current.id} storage must exceed ${previous.id}`);
    assert.ok(current.maxUploadBytes > previous.maxUploadBytes, `${current.id} upload limit must exceed ${previous.id}`);
    assert.ok(current.weeklyExternalAiUsd > previous.weeklyExternalAiUsd, `${current.id} AI wallet must exceed ${previous.id}`);
  }
  assert.equal(getPlan('not-a-plan').id, 'free');
});

test('AI feature entitlements cannot regress', () => {
  assert.equal(canUseAiFeature('free', 'chat'), true);
  assert.equal(canUseAiFeature('free', 'studio'), false);
  assert.equal(canUseAiFeature('plus', 'studio'), true);
  assert.equal(canUseAiFeature('plus', 'video'), false);
  assert.equal(canUseAiFeature('pro', 'video'), true);
  assert.equal(canUseAiFeature('family', 'command'), true);
});

test('native shell remains HTTPS-only and scoped to SnapNext', async () => {
  const config = await read('capacitor.config.ts');
  assert.match(config, /appId:\s*['"]ai\.snapnext\.app['"]/);
  assert.match(config, /url:\s*['"]https:\/\/snapnext\.ai['"]/);
  assert.match(config, /cleartext:\s*false/);
  assert.match(config, /allowMixedContent:\s*false/);
  assert.doesNotMatch(config, /http:\/\//);
});

test('mobile-facing source files do not contain leaked UUID labels', async () => {
  const files = [
    'components/magic-library/MagicLibraryGalleryMagic.js',
    'components/magic-library/PeopleRow.js',
    'lib/magic-library-sections.js',
  ];
  for (const file of files) {
    const source = await read(file);
    const userFacingStrings = [...source.matchAll(/(['"`])((?:(?!\1).)*)\1/g)].map((match) => match[2]);
    const leaked = userFacingStrings.find((value) => UUID_PATTERN.test(value));
    assert.equal(leaked, undefined, `${file} contains a UUID in a user-facing string`);
  }
});

test('production smoke suite protects launch-critical routes', async () => {
  const smoke = await read('scripts/smoke-test.mjs');
  for (const expected of ['/upload', '/billing', '/privacy', '/terms', '/ai-policy', '/family-safety', '/manifest.json', '/sw.js']) {
    assert.ok(smoke.includes(expected), `smoke test is missing ${expected}`);
  }
  assert.match(smoke, /Oversized API write is rejected early/);
  assert.match(smoke, /Unknown browser origin is rejected/);
});
