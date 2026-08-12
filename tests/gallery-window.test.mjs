import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampGalleryBatchSize,
  createGalleryWindow,
  galleryRestoreNeedsMore,
  gallerySessionKey,
  MAX_GALLERY_RESTORE_ITEMS,
  nextGalleryVisibleCount,
  normalizeGallerySessionState,
} from '../lib/gallery-window.js';

test('gallery window renders only the requested progressive slice', () => {
  const items = Array.from({ length: 1000 }, (_, id) => ({ id }));
  const window = createGalleryWindow(items, 60);
  assert.equal(window.items.length, 60);
  assert.equal(window.hasMore, true);
  assert.equal(window.remaining, 940);
});

test('gallery batch size is bounded for mobile memory safety', () => {
  assert.equal(clampGalleryBatchSize(1), 20);
  assert.equal(clampGalleryBatchSize(1000), 200);
  assert.equal(nextGalleryVisibleCount(60, 1000, 60), 120);
  assert.equal(nextGalleryVisibleCount(980, 1000, 60), 1000);
});

test('gallery session state is scoped to filters and search', () => {
  assert.equal(gallerySessionKey({ filter: 'photo', search: 'Paris' }), 'snapnext:gallery:v3:photo:paris');
});

test('Gallery scroll restoration is bounded instead of replaying an unbounded library', () => {
  const state = normalizeGallerySessionState({ scrollY: 99_999_999, loadedCount: 50_000 });
  assert.equal(state.loadedCount, MAX_GALLERY_RESTORE_ITEMS);
  assert.equal(state.wasCapped, true);
  assert.ok(state.scrollY > 0);
});

test('Gallery restoration loads another page only when the saved session needs it', () => {
  const target = normalizeGallerySessionState({ scrollY: 2000, loadedCount: 240 });
  assert.equal(galleryRestoreNeedsMore({
    target,
    loadedCount: 60,
    hasMore: true,
    nextCursor: 'cursor',
    loading: false,
    loadingMore: false,
  }), true);
  assert.equal(galleryRestoreNeedsMore({
    target,
    loadedCount: 240,
    hasMore: true,
    nextCursor: 'cursor',
    loading: false,
    loadingMore: false,
  }), false);
  assert.equal(galleryRestoreNeedsMore({
    target,
    loadedCount: 60,
    hasMore: false,
    nextCursor: null,
    loading: false,
    loadingMore: false,
  }), false);
});
