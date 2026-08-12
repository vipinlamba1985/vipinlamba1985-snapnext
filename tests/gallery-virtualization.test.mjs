import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGalleryVirtualLayout,
  galleryColumnCount,
  selectGalleryVirtualRows,
} from '../lib/gallery-virtualization.js';

test('Gallery virtualization follows the same responsive column contract as the UI', () => {
  assert.equal(galleryColumnCount(390), 2);
  assert.equal(galleryColumnCount(800), 3);
  assert.equal(galleryColumnCount(1100), 4);
  assert.equal(galleryColumnCount(1400), 6);
});

test('one huge backup day is split into virtual rows instead of one giant DOM section', () => {
  const items = Array.from({ length: 5000 }, (_, index) => ({ id: `m-${index}` }));
  const layout = buildGalleryVirtualLayout([{ key: 'today', title: 'Added today', items }], 390);

  assert.equal(layout.columns, 2);
  assert.equal(layout.rows[0].type, 'header');
  assert.equal(layout.rows.filter(row => row.type === 'items').length, 2500);

  const rendered = selectGalleryVirtualRows(layout.rows, 40_000, 844, 900);
  assert.ok(rendered.length < 40, `viewport should render a small row window, got ${rendered.length}`);
  assert.ok(rendered.some(row => row.type === 'items'));
});

test('virtual rows preserve every item exactly once across day groups', () => {
  const groups = [
    { key: 'a', title: 'A', items: Array.from({ length: 17 }, (_, index) => ({ id: `a-${index}` })) },
    { key: 'b', title: 'B', items: Array.from({ length: 13 }, (_, index) => ({ id: `b-${index}` })) },
  ];
  const layout = buildGalleryVirtualLayout(groups, 900);
  const ids = layout.rows.flatMap(row => row.type === 'items' ? row.items.map(item => item.id) : []);

  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, 30);
  assert.ok(layout.totalHeight > 0);
});

test('virtual selection includes overscan but never the entire distant library', () => {
  const items = Array.from({ length: 1000 }, (_, index) => ({ id: index }));
  const layout = buildGalleryVirtualLayout([{ key: 'all', title: 'All', items }], 1200);
  const topRows = selectGalleryVirtualRows(layout.rows, 0, 800, 400);
  const middleRows = selectGalleryVirtualRows(layout.rows, Math.floor(layout.totalHeight / 2), 800, 400);

  assert.ok(topRows.length > 0);
  assert.ok(middleRows.length > 0);
  assert.ok(topRows.length < layout.rows.length / 3);
  assert.ok(middleRows.length < layout.rows.length / 3);
});
