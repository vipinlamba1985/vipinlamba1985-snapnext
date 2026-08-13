import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ORIGINALS_PREFIX,
  THUMBNAIL_PREFIX,
  VIDEO_POSTER_MAX_BYTES,
  VIDEO_POSTER_SIZE,
  canStoreVideoPoster,
  fitVideoPosterDimensions,
  isThumbnailKey,
  thumbnailKey,
  videoPosterKey,
} from '../lib/thumbnails.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

test('video posters live with hot derivatives and never with originals', () => {
  const poster = videoPosterKey({ userId: 'u1', mediaId: 'v1' });
  assert.ok(poster.startsWith(`${THUMBNAIL_PREFIX}/`));
  assert.ok(!poster.startsWith(`${ORIGINALS_PREFIX}/`));
  assert.equal(isThumbnailKey(poster), true);
  assert.notEqual(poster, thumbnailKey({ userId: 'u1', mediaId: 'v1', size: VIDEO_POSTER_SIZE }));
  assert.match(poster, /poster-v1-480\.jpg$/);
});

test('poster addressing is bounded and sanitised', () => {
  const poster = videoPosterKey({ userId: '../../u', mediaId: '../v/1' });
  assert.ok(!poster.includes('..'));
  assert.throws(() => videoPosterKey({ mediaId: 'v1' }));
  assert.throws(() => videoPosterKey({ userId: 'u1' }));
  assert.ok(VIDEO_POSTER_MAX_BYTES <= 1024 * 1024, 'a poster must stay far below original-video size');
});

test('only stored videos can accept a device poster', () => {
  assert.equal(canStoreVideoPoster({ kind: 'video', mime: 'video/mp4', storageKey: 'users/u/media/v/a.mp4' }), true);
  assert.equal(canStoreVideoPoster({ kind: 'photo', mime: 'image/jpeg', storageKey: 'users/u/media/p/a.jpg' }), false);
  assert.equal(canStoreVideoPoster({ kind: 'video', mime: 'image/jpeg', storageKey: 'k' }), false);
  assert.equal(canStoreVideoPoster({ kind: 'video', mime: 'video/mp4' }), false);
});

test('local poster dimensions never enlarge and preserve aspect ratio', () => {
  assert.deepEqual(fitVideoPosterDimensions(1920, 1080), { width: 480, height: 270 });
  assert.deepEqual(fitVideoPosterDimensions(1080, 1920), { width: 270, height: 480 });
  assert.deepEqual(fitVideoPosterDimensions(320, 180), { width: 320, height: 180 });
});

test('poster upload is authenticated, owner scoped, bounded and video only', async () => {
  const route = await read(path.join('app', 'api', 'media', '[id]', 'poster', 'route.js'));
  assert.match(route, /getUserFromRequest\(request\)/);
  assert.match(route, /userId: user\.id/);
  assert.match(route, /doc\.kind !== 'video'/);
  assert.match(route, /VIDEO_POSTER_MAX_BYTES/);
  assert.match(route, /storeVideoPoster/);
  assert.doesNotMatch(route, /storage\.read|GetObjectCommand|mediaSrc/, 'poster upload must never read the original video');
});

test('thumbnail GET serves a poster without falling through to original video storage', async () => {
  const route = await read(path.join('app', 'api', 'media', '[id]', 'thumbnail', 'route.js'));
  const videoBranch = route.slice(route.indexOf("if (doc.kind === 'video')"), route.indexOf("if (doc.kind !== 'photo')"));
  assert.match(videoBranch, /getVideoPoster/);
  assert.match(videoBranch, /Video poster not available/);
  assert.doesNotMatch(videoBranch, /storage\.read|GetObjectCommand/, 'video grid reads must never touch the original through the thumbnail route');
});

test('device extraction uploads only a small JPEG derivative and has no provider calls', async () => {
  const client = await read(path.join('lib', 'video-poster-client.js'));
  assert.match(client, /URL\.createObjectURL\(file\)/);
  assert.match(client, /context\.drawImage\(video/);
  assert.match(client, /toBlob\(blob => resolve\(blob \|\| null\), 'image\/jpeg'/);
  assert.match(client, /apiFetch\(`\/media\/\$\{encodeURIComponent\(mediaId\)\}\/poster`/);
  assert.doesNotMatch(client, /OpenAI|Gemini|Rekognition|MediaConvert|ffmpeg/i);
});

test('backup completion never waits on poster success', async () => {
  const upload = await read(path.join('lib', 'protection-upload-one.js'));
  assert.match(upload, /item\.kind === 'video' && item\.file/);
  assert.match(upload, /buildLocalVideoPoster\(item\.file\)/);
  assert.match(upload, /localVideoPosterPromise[\s\S]*finishLocalVideoPoster/);
  assert.match(upload, /persistLocalVideoPoster\(mediaId, poster\)\.catch\(\(\) => null\)/);
});

test('virtualized Library requests stored posters only for rendered video rows', async () => {
  const grid = await read(path.join('components', 'gallery', 'VirtualizedDayGrid.js'));
  assert.match(grid, /item\?\.kind !== 'video'/);
  assert.match(grid, /galleryThumbnailSrc\(item\.id, 480\)/);
  assert.match(grid, /visibleRows\.map/);
});

test('legacy videos with no stored poster use a bounded live-frame fallback instead of a black tile', async () => {
  const grid = await read(path.join('components', 'gallery', 'VirtualizedDayGrid.js'));
  assert.match(grid, /onError=\{\(\) => setPosterMissing\(true\)\}/);
  assert.match(grid, /originalSrc = mediaSrc\(item\.id\)/);
  assert.match(grid, /preload="metadata"/);
  assert.match(grid, /onLoadedMetadata=\{seekLegacyVideoPreview\}/);
  assert.match(grid, /video\.currentTime = frameTime/);
  assert.match(grid, /Math\.min\(Math\.max\(duration \* 0\.02, 0\.05\), 0\.5\)/);
  assert.doesNotMatch(grid, /OpenAI|Gemini|Rekognition|MediaConvert|ffmpeg|apiFetch\(/i);
});
