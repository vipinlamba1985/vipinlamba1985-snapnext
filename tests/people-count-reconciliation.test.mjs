import test from 'node:test';
import assert from 'node:assert/strict';
import {
  choosePersonCounts,
  historicalPersonMediaIds,
  shouldUseHistoricalPersonFallback,
  supportsHistoricalPersonFallback,
} from '../lib/people-count-reconciliation.js';

test('historical person media ids are unique and include the representative photo', () => {
  assert.deepEqual(
    historicalPersonMediaIds({ mediaIds: ['a', 'b', 'a', ''], representativeMediaId: 'c' }),
    ['a', 'b', 'c'],
  );
});

test('historical fallback is restricted to self or explicitly restored people with zero live matches', () => {
  const ordinary = { mediaIds: ['a'] };
  const self = { isSelf: true, mediaIds: ['a'] };
  const restored = { restoredAt: new Date(), mediaIds: ['a'] };

  assert.equal(supportsHistoricalPersonFallback(ordinary), false);
  assert.equal(shouldUseHistoricalPersonFallback(ordinary, 0), false);
  assert.equal(shouldUseHistoricalPersonFallback(self, 0), true);
  assert.equal(shouldUseHistoricalPersonFallback(restored, 0), true);
  assert.equal(shouldUseHistoricalPersonFallback(self, 1), false);
});

test('live v3 membership remains authoritative whenever it has matches', () => {
  assert.deepEqual(
    choosePersonCounts(
      { isSelf: true, mediaIds: ['old-1', 'old-2', 'old-3'] },
      { count: 2, photos: 2, videos: 0 },
      { count: 3, photos: 3, videos: 0 },
    ),
    {
      count: 2,
      photos: 2,
      videos: 0,
      source: 'live_cluster_membership',
      reconciled: false,
    },
  );
});

test('a restored or self card uses live, non-trashed historical media when its v3 membership is empty', () => {
  assert.deepEqual(
    choosePersonCounts(
      { restoredAt: new Date(), mediaIds: ['old-1', 'old-2'] },
      { count: 0, photos: 0, videos: 0 },
      { count: 2, photos: 2, videos: 0 },
    ),
    {
      count: 2,
      photos: 2,
      videos: 0,
      source: 'restored_media_history',
      reconciled: true,
    },
  );
});

test('stale historical ids do not manufacture a count when no live media remains', () => {
  assert.deepEqual(
    choosePersonCounts(
      { isSelf: true, mediaIds: ['deleted-photo'] },
      { count: 0, photos: 0, videos: 0 },
      { count: 0, photos: 0, videos: 0 },
    ),
    {
      count: 0,
      photos: 0,
      videos: 0,
      source: 'live_cluster_membership',
      reconciled: false,
    },
  );
});
