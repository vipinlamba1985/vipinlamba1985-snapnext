import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContextualSearchGroups,
  parseMemorySearchIntent,
  queryTerms,
  searchMemoryBrain,
} from '../lib/memory-brain.js';

function photo(id, {
  createdAt = '2026-01-01T12:00:00.000Z',
  capturedAt,
  favorite = false,
  userTags = [],
  people = [],
  tags = [],
  description = '',
  qualityScore = 50,
} = {}) {
  return {
    id,
    name: `${id}.jpg`,
    kind: 'photo',
    createdAt,
    capturedAt,
    favorite,
    userTags,
    aiAnalysis: { people, tags, description, qualityScore },
  };
}

test('query parsing separates descriptive terms from media, date, and ranking instructions', () => {
  assert.deepEqual(queryTerms('Show my best beach photos from 2025'), ['beach']);
  assert.deepEqual(queryTerms('Find recent pictures of beaches'), ['beach']);
  assert.deepEqual(queryTerms('Show everything from my earliest clips'), []);
  const intent = parseMemorySearchIntent('Show my favorite beach photos from 2025');
  assert.equal(intent.mediaKind, 'photo');
  assert.equal(intent.favoritesOnly, true);
  assert.equal(intent.range.label, '2025');
});

test('confirmed relationship aliases become precise person requirements', () => {
  const groups = buildContextualSearchGroups('Show my son at the beach', [{
    relationship: 'Son',
    displayName: 'My son',
    personName: 'Priyansh',
  }]);
  assert.deepEqual(groups, [['beach'], ['priyansh']]);
});

test('beach photo search excludes unrelated photos and beach videos', () => {
  const items = [
    photo('beach-photo', { userTags: ['Beach'], qualityScore: 40 }),
    photo('unrelated-portrait', { favorite: true, tags: ['portrait'], qualityScore: 99 }),
    { ...photo('beach-video', { tags: ['beach'] }), kind: 'video' },
  ];
  const result = searchMemoryBrain(items, 'Show my beach photos');
  assert.deepEqual(result.matches.map((item) => item.id), ['beach-photo']);
  assert.ok(result.matches[0].reasons.some((reason) => /tag: beach/.test(reason)));
});

test('search returns no results instead of substituting high-quality unrelated memories', () => {
  const items = [
    photo('portrait', { tags: ['portrait'], qualityScore: 99 }),
    photo('birthday', { tags: ['birthday', 'cake'], qualityScore: 95 }),
  ];
  assert.deepEqual(searchMemoryBrain(items, 'Show my beach photos').matches, []);
});

test('multi-part searches require every meaningful subject', () => {
  const items = [
    photo('priyansh-at-beach', { people: ['Priyansh'], tags: ['beach'] }),
    photo('priyansh-portrait', { people: ['Priyansh'], tags: ['portrait'] }),
    photo('empty-beach', { tags: ['beach'] }),
  ];
  const result = searchMemoryBrain(items, 'Show Priyansh beach photos');
  assert.deepEqual(result.matches.map((item) => item.id), ['priyansh-at-beach']);
  assert.equal(result.matches[0].matchedTerms, 2);
});

test('favorite, media type, and year are hard filters', () => {
  const items = [
    photo('correct', { capturedAt: '2025-07-10T12:00:00.000Z', favorite: true, tags: ['beach'] }),
    photo('not-favorite', { capturedAt: '2025-07-10T12:00:00.000Z', tags: ['beach'] }),
    photo('wrong-year', { capturedAt: '2024-07-10T12:00:00.000Z', favorite: true, tags: ['beach'] }),
    { ...photo('wrong-kind', { capturedAt: '2025-07-10T12:00:00.000Z', favorite: true, tags: ['beach'] }), kind: 'video' },
  ];
  const result = searchMemoryBrain(items, 'Show my favorite beach photos from 2025');
  assert.deepEqual(result.matches.map((item) => item.id), ['correct']);
});

test('structured searches still support browsing and recency without inventing a subject match', () => {
  const items = [
    photo('older-photo', { capturedAt: '2025-01-01T12:00:00.000Z' }),
    photo('newer-photo', { capturedAt: '2026-01-01T12:00:00.000Z' }),
    { ...photo('newest-video', { capturedAt: '2026-06-01T12:00:00.000Z' }), kind: 'video' },
  ];
  const result = searchMemoryBrain(items, 'Show my latest photos', { now: new Date('2026-07-25T12:00:00.000Z') });
  assert.deepEqual(result.matches.map((item) => item.id), ['newer-photo', 'older-photo']);
});

test('exact token matching avoids substring false positives', () => {
  const items = [
    photo('car', { tags: ['car'] }),
    photo('card', { description: 'A birthday card on the table' }),
  ];
  assert.deepEqual(searchMemoryBrain(items, 'Show car photos').matches.map((item) => item.id), ['car']);
});
