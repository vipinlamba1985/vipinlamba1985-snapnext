// The grid used to render by streaming each original photo in full — a 4 MB
// file downloaded to draw a 200px tile, repeated every hour when the browser
// cache expired. That burns bandwidth and, more importantly, keeps the
// originals hot, which makes moving them to cold storage lose money rather than
// save it. Derivatives now live under their own prefix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_THUMBNAIL_SIZE,
  ORIGINALS_PREFIX,
  THUMBNAIL_PREFIX,
  THUMBNAIL_SIZES,
  bytesSavedPerView,
  canGenerateThumbnail,
  isThumbnailKey,
  normalizeThumbnailSize,
  thumbnailKey,
} from '../lib/thumbnails.js';
import { mediaLifecycleConfiguration } from '../lib/storage-lifecycle.js';
import { renderThumbnail } from '../lib/thumbnails.server.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the pure module reaches no storage client', async () => {
  const source = await readFile(path.join(repoRoot, 'lib', 'thumbnails.js'), 'utf8');
  assert.doesNotMatch(source, /^import /m, 'thumbnail addressing must stay import-free');
});

test('a derivative never shares a prefix with an original', () => {
  const key = thumbnailKey({ userId: 'u1', mediaId: 'm1' });
  assert.ok(key.startsWith(`${THUMBNAIL_PREFIX}/`));
  assert.ok(!key.startsWith(`${ORIGINALS_PREFIX}/`), 'a derivative under users/ would be moved to cold storage too');
  assert.equal(isThumbnailKey(key), true);
  assert.equal(isThumbnailKey('users/u1/media/m1/photo.jpg'), false);
});

test('the key encodes size and version so it can be cached forever', () => {
  const key = thumbnailKey({ userId: 'u1', mediaId: 'm1', size: 240 });
  assert.match(key, /v1-240\.jpg$/);
  // Different widths must not collide.
  assert.notEqual(key, thumbnailKey({ userId: 'u1', mediaId: 'm1', size: 960 }));
  // Different owners must not collide.
  assert.notEqual(key, thumbnailKey({ userId: 'u2', mediaId: 'm1', size: 240 }));
});

test('keys are sanitised and never escape the prefix', () => {
  const key = thumbnailKey({ userId: '../../etc', mediaId: 'a/b' });
  assert.ok(key.startsWith(`${THUMBNAIL_PREFIX}/`));
  assert.ok(!key.includes('..'), 'a traversal attempt must not survive into the key');
});

test('a key cannot be built without an owner', () => {
  assert.throws(() => thumbnailKey({ mediaId: 'm1' }));
  assert.throws(() => thumbnailKey({ userId: 'u1' }));
});

test('only a closed set of widths is allowed', () => {
  // An open set would let a caller mint unlimited stored objects.
  assert.equal(normalizeThumbnailSize(200), 240);
  assert.equal(normalizeThumbnailSize(480), 480);
  assert.equal(normalizeThumbnailSize(99999), THUMBNAIL_SIZES[THUMBNAIL_SIZES.length - 1]);
  assert.equal(normalizeThumbnailSize('nonsense'), DEFAULT_THUMBNAIL_SIZE);
  assert.equal(normalizeThumbnailSize(-5), DEFAULT_THUMBNAIL_SIZE);
});

test('only photos are resized', () => {
  assert.equal(canGenerateThumbnail({ kind: 'photo', storageKey: 'users/u/m/a.jpg' }), true);
  assert.equal(canGenerateThumbnail({ kind: 'video', storageKey: 'users/u/m/a.mp4' }), false);
  assert.equal(canGenerateThumbnail({ kind: 'photo' }), false, 'no stored file means nothing to read');
  assert.equal(canGenerateThumbnail({ kind: 'photo', mime: 'application/pdf', storageKey: 'k' }), false);
});

test('resizing actually shrinks the image by an order of magnitude', async () => {
  const sharp = (await import('sharp')).default;
  const original = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: { r: 120, g: 80, b: 200 } } })
    .jpeg({ quality: 90 })
    .toBuffer();

  const thumb = await renderThumbnail(original, 480);
  assert.ok(thumb.length < original.length / 10, `thumbnail ${thumb.length} is not much smaller than ${original.length}`);

  const meta = await sharp(thumb).metadata();
  assert.ok(meta.width <= 480 && meta.height <= 480);
  assert.equal(meta.format, 'jpeg');
  assert.ok(bytesSavedPerView({ originalBytes: original.length, thumbnailBytes: thumb.length }) > 0);
});

test('the lifecycle policy moves originals and leaves derivatives hot', () => {
  const rules = new Map(mediaLifecycleConfiguration().Rules.map((rule) => [rule.ID, rule]));

  // The prefix must match where originals actually live (lib/storage.js builds
  // `users/{userId}/media/...`). An earlier version used `originals/`, which
  // matched nothing and would have saved nothing while appearing to work.
  assert.equal(rules.get('snapnext-originals-cooldown').Filter.Prefix, `${ORIGINALS_PREFIX}/`);
  assert.equal(rules.get('snapnext-derivatives-stay-hot').Filter.Prefix, `${THUMBNAIL_PREFIX}/`);
  assert.equal(rules.get('snapnext-derivatives-stay-hot').Transitions, undefined);
});

test('the thumbnail route serves the cache before touching the original', async () => {
  const route = await readFile(path.join(repoRoot, 'app', 'api', 'media', '[id]', 'thumbnail', 'route.js'), 'utf8');
  assert.match(route, /getOrCreateThumbnail/);
  // The original is read through a callback, so it is only fetched on a miss.
  assert.match(route, /source: \(\) => storage\.read/);
  // A cached derivative is immutable and may be held far longer than an hour.
  assert.match(route, /max-age=31536000, immutable/);
});

test('a cached derivative is only read, and the original is never rewritten', async () => {
  const server = await readFile(path.join(repoRoot, 'lib', 'thumbnails.server.js'), 'utf8');
  // Writes must target the derivative key, never doc.storageKey.
  assert.match(server, /writeCached\(key, buffer\)/);
  assert.doesNotMatch(server, /Key: doc\.storageKey/, 'the original must never be written');
  assert.doesNotMatch(server, /DeleteObject/, 'nothing here may delete');
});
