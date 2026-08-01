// "Memory Health" reported success for work it never did: hardcoded bucket
// counts, a two-second timer standing in for a scan, and a fix button that said
// "space was reclaimed" without deleting anything. Cleanup has one real home
// (/gallery/cleanup, backed by lib/triage.js and /api/triage). These tests stop
// a second, fake one from reappearing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTriagePlan } from '../lib/triage.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

/** Comments explain the retired mock, so assertions run against code only. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('/health redirects to the cleanup surface that actually works', async () => {
  const page = await read(path.join('app', '(app)', 'health', 'page.js'));
  assert.match(page, /redirect\('\/gallery\/cleanup'\)/);

  // The mock must not come back in any form.
  const code = stripComments(page);
  assert.doesNotMatch(code, /setTimeout/, 'a timer is not a scan');
  assert.doesNotMatch(code, /reclaimed/i, 'never claim space was freed');
  assert.doesNotMatch(code, /41\.5 MB|124\.0 MB|210\.5 MB/, 'hardcoded sizes are fiction');
  assert.doesNotMatch(code, /useState/, 'a redirect needs no state');
});

test('nothing links to the retired /health route', async () => {
  for (const file of [
    path.join('components', 'AppShell.js'),
    path.join('app', '(app)', 'dashboard', 'page.js'),
  ]) {
    const source = await read(file);
    assert.doesNotMatch(source, /['"]\/health['"]/, `${file} still points at the retired route`);
    assert.match(source, /\/gallery\/cleanup/, `${file} should link to the real cleanup surface`);
  }
});

test('cleanup numbers come from real media, not literals', () => {
  const now = new Date('2026-08-01T00:00:00Z');
  const empty = buildTriagePlan([], now);
  // The old page showed "12 duplicates / 41.5 MB" even on an empty library.
  assert.deepEqual(empty.buckets, []);
  assert.equal(empty.totals.reclaimableBytes, 0);
  assert.equal(empty.totals.scanned, 0);

  const plan = buildTriagePlan([
    { id: 'a', hash: 'dup', size: 1000, kind: 'photo', name: 'a.jpg', createdAt: now },
    { id: 'b', hash: 'dup', size: 1000, kind: 'photo', name: 'b.jpg', createdAt: now },
    { id: 'c', hash: 'solo', size: 500, kind: 'photo', name: 'c.jpg', createdAt: now },
  ], now);

  const duplicates = plan.buckets.find(bucket => bucket.id === 'duplicates');
  assert.ok(duplicates, 'a real duplicate pair must produce a duplicates bucket');
  // One of the two identical files is redundant — the other is kept.
  assert.equal(duplicates.count, 1);
  assert.equal(duplicates.reclaimableBytes, 1000);
  assert.equal(duplicates.safety, 'safe');
  assert.equal(plan.totals.scanned, 3);
});

test('no item appears in two buckets, so reclaimable space is never double promised', () => {
  const now = new Date('2026-08-01T00:00:00Z');
  const big = 200 * 1024 * 1024;
  // Both copies qualify as "large videos"; the second is also an exact
  // duplicate. The redundant copy must be claimed by exactly one bucket, while
  // the keeper is still fair game for review as a large video.
  const plan = buildTriagePlan([
    { id: 'a', hash: 'same', size: big, kind: 'video', name: 'clip.mov', createdAt: now },
    { id: 'b', hash: 'same', size: big, kind: 'video', name: 'clip-copy.mov', createdAt: now },
  ], now);

  const ids = plan.buckets.flatMap(bucket => bucket.items.map(item => item.id));
  assert.equal(ids.length, new Set(ids).size, 'an item was counted in two buckets');

  // Totals must equal the buckets, not the sum of every rule that matched.
  const bucketBytes = plan.buckets.reduce((total, bucket) => total + bucket.reclaimableBytes, 0);
  assert.equal(plan.totals.reclaimableBytes, bucketBytes);

  const duplicates = plan.buckets.find(bucket => bucket.id === 'duplicates');
  assert.equal(duplicates.count, 1, 'only the redundant copy is safe to remove');
});
