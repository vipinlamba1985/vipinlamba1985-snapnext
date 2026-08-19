import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Magic manifest delivery hydrates only owned active playback metadata', async () => {
  const route = await readFile(new URL('../app/api/magic-library/manifest/route.js', import.meta.url), 'utf8');
  assert.match(route, /delivery\.cards/);
  assert.match(route, /userId, id: \{ \$in: ids \}, trashed: \{ \$ne: true \}/);
  assert.match(route, /kind: 1/);
  assert.match(route, /durationMs: 1/);
  assert.match(route, /private, no-store/);
});

test('full Magic playback uses one active video decoder and the licensed bundled soundtrack', async () => {
  const player = await readFile(new URL('../components/magic-library/MagicHighlightPlayer.js', import.meta.url), 'utf8');
  assert.match(player, /activeIsVideo/);
  assert.match(player, /<video/);
  assert.match(player, /preload="metadata"/);
  assert.match(player, /VIDEO_CLIP_MAX_SECONDS = 6/);
  assert.match(player, /mediaSrc\(active\.id\)/);
  assert.match(player, /soundtrackForStory/);
  assert.match(player, /preload="none"/);
  assert.match(player, /galleryThumbnailSrc\(active\.id, 1200\)/);
});

test('Home Magic autoplay is muted, user-configurable, visibility-aware and derivative-only', async () => {
  const home = await readFile(new URL('../components/magic-library/MagicHomeHighlight.js', import.meta.url), 'utf8');
  assert.match(home, /snapnext:magic-autoplay:v1/);
  assert.match(home, /IntersectionObserver/);
  assert.match(home, /getBattery/);
  assert.match(home, /prefers-reduced-motion/);
  assert.match(home, /Autoplay: Wi-Fi/);
  assert.match(home, /galleryThumbnailSrc\(activeId, 1200\)/);
  assert.match(home, /preload="none"/);
  assert.doesNotMatch(home, /mediaSrc\(/);
});

test('Home surfaces Magic manifest highlight instead of the older Ready Stories stream', async () => {
  const layout = await readFile(new URL('../app/(app)/dashboard/layout.js', import.meta.url), 'utf8');
  assert.match(layout, /MagicHomeHighlight/);
  assert.doesNotMatch(layout, /HomeReadyStories/);
});
