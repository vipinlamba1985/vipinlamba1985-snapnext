// Triage must stay a pure metadata feature: correct about what it proposes,
// honest about what it does not know, and free to run on a huge library.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildTriagePlan,
  duplicateGroups,
  isScreenshotByName,
  largeVideos,
  oldScreenshots,
  sumBytes,
  untouchedOldMedia,
  LARGE_VIDEO_MIN_BYTES,
} from '../lib/triage.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2025-06-01T00:00:00Z');
const daysAgo = days => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

test('duplicates keep exactly one copy per hash', () => {
  const groups = duplicateGroups([
    { id: 'a', hash: 'h1', size: 100, createdAt: daysAgo(10) },
    { id: 'b', hash: 'h1', size: 100, createdAt: daysAgo(5) },
    { id: 'c', hash: 'h1', size: 100, createdAt: daysAgo(1) },
    { id: 'd', hash: 'h2', size: 50, createdAt: daysAgo(3) },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].keeper.id, 'a', 'the oldest copy is kept');
  assert.deepEqual(groups[0].redundant.map(i => i.id), ['b', 'c']);
  assert.equal(groups[0].reclaimableBytes, 200);
});

test('a starred copy is never the one proposed for removal', () => {
  const [group] = duplicateGroups([
    { id: 'old', hash: 'h1', size: 10, createdAt: daysAgo(30) },
    { id: 'starred', hash: 'h1', size: 10, createdAt: daysAgo(2), favorite: true },
  ]);
  assert.equal(group.keeper.id, 'starred');
  assert.deepEqual(group.redundant.map(i => i.id), ['old']);
});

test('items without a hash or already trashed are not treated as duplicates', () => {
  const groups = duplicateGroups([
    { id: 'a', hash: '', size: 10 },
    { id: 'b', hash: '', size: 10 },
    { id: 'c', hash: 'h1', size: 10, trashed: true },
    { id: 'd', hash: 'h1', size: 10, trashed: true },
  ]);
  assert.deepEqual(groups, []);
});

test('large videos and old screenshots skip anything starred', () => {
  const big = LARGE_VIDEO_MIN_BYTES + 1;
  assert.deepEqual(
    largeVideos([
      { id: 'keep', kind: 'video', size: big, favorite: true },
      { id: 'big', kind: 'video', size: big },
      { id: 'small', kind: 'video', size: 10 },
      { id: 'photo', kind: 'photo', size: big },
    ]).map(i => i.id),
    ['big'],
  );

  assert.deepEqual(
    oldScreenshots([
      { id: 'old', name: 'Screenshot 2023.png', kind: 'photo', size: 5, createdAt: daysAgo(200) },
      { id: 'recent', name: 'Screenshot 2025.png', kind: 'photo', size: 5, createdAt: daysAgo(3) },
      { id: 'starred', name: 'Screenshot x.png', kind: 'photo', size: 5, createdAt: daysAgo(200), favorite: true },
    ], NOW).map(i => i.id),
    ['old'],
  );
});

test('screenshot detection reads the filename only', () => {
  assert.ok(isScreenshotByName({ name: 'Screenshot 2024-01-02.png', kind: 'photo' }));
  assert.ok(isScreenshotByName({ name: 'screen_recording.mov', kind: 'photo' }));
  assert.ok(!isScreenshotByName({ name: 'beach.jpg', kind: 'photo' }));
  // A video is never screenshot clutter, whatever it is called.
  assert.ok(!isScreenshotByName({ name: 'screenshot.mp4', kind: 'video' }));
  // Crucially, it does not consult aiAnalysis, so it costs nothing.
  assert.ok(!isScreenshotByName({ name: 'beach.jpg', kind: 'photo', aiAnalysis: { contentType: 'screenshot' } }));
});

test('"old and never starred" excludes starred and recent media', () => {
  assert.deepEqual(
    untouchedOldMedia([
      { id: 'ancient', size: 1, createdAt: daysAgo(400) },
      { id: 'starred', size: 1, createdAt: daysAgo(400), favorite: true },
      { id: 'recent', size: 1, createdAt: daysAgo(30) },
    ], NOW).map(i => i.id),
    ['ancient'],
  );
});

test('a file is only ever counted in one bucket', () => {
  const plan = buildTriagePlan([
    // Duplicated, huge, old video: qualifies for several buckets at once.
    { id: 'v1', hash: 'h1', kind: 'video', size: LARGE_VIDEO_MIN_BYTES + 1, createdAt: daysAgo(500) },
    { id: 'v2', hash: 'h1', kind: 'video', size: LARGE_VIDEO_MIN_BYTES + 1, createdAt: daysAgo(499) },
  ], NOW);

  const ids = plan.buckets.flatMap(bucket => bucket.items.map(item => item.id));
  assert.equal(new Set(ids).size, ids.length, 'no item appears in two buckets');
  assert.equal(plan.totals.reclaimableBytes, sumBytes(plan.buckets.flatMap(b => b.items)));
});

test('the plan reports safe and review space separately and hides empty buckets', () => {
  const plan = buildTriagePlan([
    { id: 'a', hash: 'h1', size: 100, kind: 'photo', createdAt: daysAgo(10) },
    { id: 'b', hash: 'h1', size: 100, kind: 'photo', createdAt: daysAgo(9) },
    { id: 't', size: 500, kind: 'photo', trashed: true, createdAt: daysAgo(2) },
  ], NOW);

  assert.deepEqual(plan.buckets.map(b => b.id), ['duplicates', 'trashed']);
  assert.equal(plan.totals.safeBytes, 600);
  assert.equal(plan.totals.reviewBytes, 0);
  assert.equal(plan.totals.scanned, 3);
  assert.ok(plan.buckets.every(bucket => bucket.count > 0));
});

test('an empty library produces an empty, non-alarming plan', () => {
  const plan = buildTriagePlan([], NOW);
  assert.deepEqual(plan.buckets, []);
  assert.equal(plan.totals.reclaimableBytes, 0);
  assert.equal(plan.totals.scanned, 0);
  // Garbage input must not throw.
  assert.equal(buildTriagePlan(null, NOW).totals.scanned, 0);
});

test('triage never reaches an AI provider or the network', async () => {
  const source = await readFile(path.join(repoRoot, 'lib', 'triage.js'), 'utf8');
  assert.doesNotMatch(source, /^import .*/m.constructor('import .*(ai-|openai|@google|groq|fetch)', 'm'));
  assert.doesNotMatch(source, /require\(/);
  // The module is self-contained: no imports at all, so it cannot pull in spend.
  assert.doesNotMatch(source, /^import /m);
});

test('the triage endpoint scopes every read to the signed-in user', async () => {
  const route = await readFile(path.join(repoRoot, 'app', 'api', 'triage', 'route.js'), 'utf8');
  assert.match(route, /getUserFromRequest/);
  assert.match(route, /if \(!user\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/);
  assert.match(route, /\.find\(\{ userId: user\.id \}\)/);
  // Projection-only: AI analysis is never loaded for triage.
  assert.doesNotMatch(route, /aiAnalysis: 1/);
});
