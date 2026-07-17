import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampGalleryBatchSize,
  createGalleryWindow,
  gallerySessionKey,
  nextGalleryVisibleCount,
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
