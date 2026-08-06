// The Library has two views and they must stay distinguishable:
//   All   — everything you own, ungated.
//   Magic — the same photos organised by person, plan-gated on active people.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { groupByDay, dayKey, dayTitle, photoDate } from '../lib/media-day-groups.js';
import { normalizeMediaFilter } from '../lib/media-library-service.js';
import { magicPeopleLimitForPlan } from '../lib/magic-library.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

test('capture metadata wins over upload time when dating a photo', () => {
  const captured = photoDate({ capturedAt: '2024-03-02T10:00:00Z', createdAt: '2025-01-01T00:00:00Z' });
  assert.equal(captured.getUTCFullYear(), 2024);
  // Nothing usable at all sorts to the epoch rather than throwing.
  assert.equal(photoDate({}).getTime(), 0);
  assert.equal(photoDate({ capturedAt: 'not-a-date' }).getTime(), 0);
});

test('days group newest first with undated media collected last', () => {
  const groups = groupByDay([
    { id: 'a', capturedAt: '2024-05-01T09:00:00Z' },
    { id: 'b', capturedAt: '2024-05-03T09:00:00Z' },
    { id: 'c' },
    { id: 'd', capturedAt: '2024-05-03T18:00:00Z' },
  ], new Date('2025-01-01T00:00:00Z'));

  assert.deepEqual(groups.map(group => group.items.length), [2, 1, 1]);
  assert.equal(groups[0].items[0].id, 'b');
  assert.equal(groups[0].items[1].id, 'd');
  assert.equal(groups.at(-1).title, 'Backup date not available');
  assert.equal(groups.at(-1).items[0].id, 'c');
});

test('today and yesterday read as words, older days as dates', () => {
  const now = new Date('2025-06-15T12:00:00Z');
  assert.equal(dayTitle(new Date('2025-06-15T08:00:00Z'), now), 'Today');
  assert.equal(dayTitle(new Date('2025-06-14T08:00:00Z'), now), 'Yesterday');
  assert.match(dayTitle(new Date('2025-06-01T08:00:00Z'), now), /June/);
  assert.equal(dayKey(new Date(0)), 'unknown');
});

test('grouping never drops or duplicates an item', () => {
  const items = Array.from({ length: 50 }, (_, index) => ({
    id: `item-${index}`,
    capturedAt: new Date(Date.UTC(2024, 0, 1 + (index % 7))).toISOString(),
  }));
  const grouped = groupByDay(items).flatMap(group => group.items);
  assert.equal(grouped.length, items.length);
  assert.equal(new Set(grouped.map(item => item.id)).size, items.length);
});

test('the All tab is a complete, ungated view', async () => {
  const source = await read(path.join('app', '(app)', 'gallery', 'page.js'));
  // No plan or entitlement gate belongs on "everything I own".
  assert.doesNotMatch(source, /entitlement|magicPeopleLimit|canUseAiFeature/i);
  // Organising by person is the Magic tab's job, so All must not offer it.
  assert.doesNotMatch(source, /\['people', /);
  assert.match(source, /\['favorite', 'Starred'\]/);
});

test('active-people limits gate Magic only, and stay plan-based', () => {
  assert.equal(magicPeopleLimitForPlan('free'), 4);
  assert.equal(magicPeopleLimitForPlan('super_user'), 500);
  assert.equal(magicPeopleLimitForPlan('nonsense-plan'), 4);
  // The All tab's filters are unaffected by any of that.
  assert.equal(normalizeMediaFilter('all'), 'all');
});

test('gallery no longer redirects away from itself', async () => {
  const layout = await read(path.join('app', '(app)', 'gallery', 'layout.js'));
  // Strip comments so the historical note in the file does not count as code.
  const code = layout.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /router\.replace/);
  assert.doesNotMatch(code, /redirect\(/);
  assert.doesNotMatch(code, /magic-library/);
});

test('the old Magic Library destinations redirect into the Library tabs', async () => {
  const magic = await read(path.join('app', '(app)', 'magic-library', 'page.js'));
  assert.match(magic, /redirect\('\/gallery\/magic'\)/);
  const all = await read(path.join('app', '(app)', 'magic-library', 'all', 'page.js'));
  assert.match(all, /redirect\('\/gallery'\)/);
});
