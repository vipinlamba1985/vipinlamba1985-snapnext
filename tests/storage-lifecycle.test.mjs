// The lifecycle policy is the largest single cost saving available, and the one
// most able to hurt the experience if it is wrong: move the wrong objects and
// ordinary browsing starts paying retrieval fees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GLACIER_RETRIEVAL_USD_PER_GB,
  STORAGE_CLASS_USD_PER_GB_MONTH,
  TRANSITION_DAYS,
  estimatedRetrievalCostUsd,
  mediaLifecycleConfiguration,
  projectedMonthlySaving,
} from '../lib/storage-lifecycle.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('only originals cool down; thumbnails stay hot', () => {
  const rules = new Map(mediaLifecycleConfiguration().Rules.map(rule => [rule.ID, rule]));

  const originals = rules.get('snapnext-originals-cooldown');
  // Must match where lib/storage.js actually writes: `users/{userId}/media/...`.
  // An earlier `originals/` matched nothing and would have saved nothing while
  // appearing to be configured correctly.
  assert.equal(originals.Filter.Prefix, 'users/');
  assert.deepEqual(originals.Transitions.map(t => t.StorageClass), ['STANDARD_IA', 'GLACIER_IR']);

  // Thumbnails are read constantly. Moving them would add a retrieval charge to
  // ordinary browsing — the one thing this must not do.
  const derivatives = rules.get('snapnext-derivatives-stay-hot');
  assert.equal(derivatives.Transitions, undefined, 'derivatives must never transition');
});

test('nothing moves before the Glacier minimum billing period', () => {
  // Glacier Instant Retrieval bills a 90-day minimum per object, so moving
  // anything sooner can cost more than leaving it in Standard.
  assert.ok(TRANSITION_DAYS.STANDARD_IA >= 90);
  assert.ok(TRANSITION_DAYS.GLACIER_IR > TRANSITION_DAYS.STANDARD_IA);

  for (const rule of mediaLifecycleConfiguration().Rules) {
    for (const transition of rule.Transitions || []) {
      assert.ok(transition.Days >= 90, `${rule.ID} moves objects after only ${transition.Days} days`);
    }
  }
});

test('the policy never deletes a photo', () => {
  for (const rule of mediaLifecycleConfiguration().Rules) {
    // Only non-current versions may expire; a live object must never be
    // removed by a cost policy.
    assert.equal(rule.Expiration, undefined, `${rule.ID} would delete live objects`);
  }
});

test('abandoned multipart uploads are cleaned up', () => {
  // Incomplete uploads are invisible in the console and billable forever.
  const withAbort = mediaLifecycleConfiguration().Rules
    .filter(rule => rule.AbortIncompleteMultipartUpload);
  assert.ok(withAbort.length >= 2);
});

test('the saving is real and worth doing', () => {
  const projection = projectedMonthlySaving({ totalGb: 1000, agedFraction: 0.7 });
  assert.ok(projection.savedPercent >= 50, `expected a majority saving, got ${projection.savedPercent}%`);
  assert.ok(projection.afterUsd < projection.beforeUsd);

  // A library with nothing old yet saves nothing, and must not claim to.
  assert.equal(projectedMonthlySaving({ totalGb: 1000, agedFraction: 0 }).savedUsd, 0);
  assert.equal(projectedMonthlySaving({ totalGb: 0 }).savedPercent, 0);
});

test('Glacier is cheaper to store but not free to read', () => {
  assert.ok(STORAGE_CLASS_USD_PER_GB_MONTH.GLACIER_IR < STORAGE_CLASS_USD_PER_GB_MONTH.STANDARD_IA);
  assert.ok(STORAGE_CLASS_USD_PER_GB_MONTH.STANDARD_IA < STORAGE_CLASS_USD_PER_GB_MONTH.STANDARD);

  // Reading a whole library back costs far more than a month of storing it,
  // which is why bulk export needs to stay rate limited.
  const oneTb = 1000;
  assert.ok(estimatedRetrievalCostUsd(oneTb) > oneTb * STORAGE_CLASS_USD_PER_GB_MONTH.GLACIER_IR);
  assert.equal(GLACIER_RETRIEVAL_USD_PER_GB, 0.03);
});

test('the apply script refuses to guess a bucket and can be dry run', async () => {
  const source = await readFile(path.join(repoRoot, 'scripts', 'apply-storage-lifecycle.mjs'), 'utf8');
  assert.match(source, /--dry-run/);
  assert.match(source, /Refusing to guess which bucket/);
  assert.doesNotMatch(source, /DeleteObject|DeleteBucket/, 'the script must never delete anything');
});
