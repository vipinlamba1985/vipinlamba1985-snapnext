import test from 'node:test';
import assert from 'node:assert/strict';
import { driveItemMatchesImportant, selectDriveProtection } from '../lib/smart-sync/selection.js';

const NOW = new Date('2026-07-28T12:00:00.000Z');
const ITEMS = [
  { id: 'starred-old', starred: true, mimeType: 'image/jpeg', modifiedTime: '2020-01-01T00:00:00.000Z' },
  { id: 'recent', starred: false, mimeType: 'video/mp4', modifiedTime: '2026-01-01T00:00:00.000Z' },
  { id: 'old', starred: false, mimeType: 'image/jpeg', modifiedTime: '2018-01-01T00:00:00.000Z' },
];
const IDS = ITEMS.map(item => item.id);
const RULES = [
  { type: 'favorites', enabled: true, priority: 1 },
  { type: 'recent', enabled: true, priority: 2 },
  { type: 'everything', enabled: true, priority: 3 },
];

test('Index-only Smart Sync inventories without selecting originals for protection', () => {
  const selection = selectDriveProtection({
    items: ITEMS,
    importableIds: IDS,
    syncMode: 'index_only',
    rules: RULES,
    now: NOW,
  });
  assert.deepEqual(selection.sourceFileIds, []);
  assert.equal(selection.indexedItems, 3);
  assert.equal(selection.indexedOnlyItems, 3);
});

test('Protect-important selects explainable favourites and recent items only', () => {
  const selection = selectDriveProtection({
    items: ITEMS,
    importableIds: IDS,
    syncMode: 'protect_important',
    rules: RULES,
    now: NOW,
  });
  assert.deepEqual(selection.sourceFileIds, ['starred-old', 'recent']);
  assert.equal(selection.indexedOnlyItems, 1);
  assert.equal(driveItemMatchesImportant(ITEMS[2], RULES, NOW), false);
});

test('Protect-everything selects every importable item', () => {
  const selection = selectDriveProtection({
    items: ITEMS,
    importableIds: IDS,
    syncMode: 'protect_everything_that_fits',
    rules: [],
    now: NOW,
  });
  assert.deepEqual(selection.sourceFileIds, IDS);
  assert.equal(selection.indexedOnlyItems, 0);
});
