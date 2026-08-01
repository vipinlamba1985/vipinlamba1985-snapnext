// Library search had two faults that worked against each other: it only ever
// looked at the 220 newest photos, so most of a real library could not be found
// at all, and it matched raw substrings, so "car" returned photos of a carpet.
// These tests pin both fixes.
import test from 'node:test';
import assert from 'node:assert/strict';

import { matchedTermCount, memorySearchTerms, searchAssetIntelligence, textTokens } from '../lib/ai-memory-retrieval.js';
import { buildSearchPattern } from '../lib/media-library-service.js';

const terms = query => memorySearchTerms(query);
const asset = (analysis, media = {}) => ({ media: { name: 'IMG_1.jpg', aiAnalysis: analysis, ...media }, intelligence: null });

function matches(query, analysis, media) {
  const { media: m, intelligence } = asset(analysis, media);
  return matchedTermCount({ media: m, intelligence, terms: terms(query) });
}

test('a term no longer matches inside an unrelated word', () => {
  // The reported bug: all three of these came back for "car".
  assert.equal(matches('car', { tags: ['carpet'] }), 0);
  assert.equal(matches('car', { tags: ['scarf'] }), 0);
  assert.equal(matches('car', { description: 'Oscar night' }), 0);

  // The real thing still matches.
  assert.equal(matches('car', { tags: ['car'] }), 1);
  assert.equal(matches('car', { description: 'a red car on the road' }), 1);
});

test('longer terms still match plurals and word endings', () => {
  assert.equal(matches('birthday', { tags: ['birthdays'] }), 1);
  assert.equal(matches('beach', { description: 'beaches at sunset' }), 1);
  // Short terms must match whole words — that is what stopped car/carpet.
  assert.equal(matches('cat', { tags: ['catalogue'] }), 0);
});

test('tokenising splits on punctuation and case', () => {
  const tokens = textTokens('Beach-Day, 2024! FAMILY');
  assert.ok(tokens.has('beach'));
  assert.ok(tokens.has('day'));
  assert.ok(tokens.has('family'));
  assert.ok(!tokens.has('beach-day,'));
});

test('library search anchors Latin terms to a word start', () => {
  assert.equal(buildSearchPattern('car'), '\\bcar');
  // Regex metacharacters stay literal.
  assert.equal(buildSearchPattern('a.b'), 'a\\.b');
  assert.equal(buildSearchPattern(''), '');
});

test('non-Latin searches keep working rather than being anchored', () => {
  // `\b` is ASCII-only in the database regex, so anchoring these would make
  // them match nothing at all.
  for (const query of ['दिवाली', '生日', 'عيد']) {
    assert.equal(buildSearchPattern(query), query, `${query} must not be anchored`);
  }
});

/** Minimal in-memory stand-in for the two collections search reads. */
function fakeDb({ media = [], intelligence = [] }) {
  const test = (doc, query) => Object.entries(query).every(([key, condition]) => {
    if (key === '$or') return condition.some(clause => test(doc, clause));
    const value = key.split('.').reduce((node, part) => (node == null ? node : node[part]), doc);
    if (condition instanceof RegExp) {
      const flat = Array.isArray(value) ? value.join(' ') : value;
      return typeof flat === 'string' && condition.test(flat);
    }
    if (condition && typeof condition === 'object') {
      if ('$ne' in condition) return value !== condition.$ne;
      if ('$in' in condition) return condition.$in.includes(value);
      if ('$regex' in condition) return new RegExp(condition.$regex, condition.$options).test(String(value ?? ''));
    }
    return value === condition;
  });

  const cursor = rows => ({
    sort: () => cursor(rows),
    limit: n => cursor(rows.slice(0, n)),
    toArray: async () => rows,
  });

  return {
    collection: name => ({
      find: query => cursor((name === 'media' ? media : intelligence).filter(doc => test(doc, query))),
    }),
  };
}

test('search reaches past the 220 most recent photos', async () => {
  // 400 unrelated photos, newest first, with the match buried at the very end.
  const media = Array.from({ length: 400 }, (_, index) => ({
    id: `filler-${index}`,
    userId: 'u1',
    name: `IMG_${index}.jpg`,
    createdAt: new Date(Date.now() - index * 1000),
    aiAnalysis: { tags: ['sunset'] },
  }));
  media.push({
    id: 'old-birthday',
    userId: 'u1',
    name: 'IMG_OLD.jpg',
    createdAt: new Date('2019-01-01'),
    aiAnalysis: { tags: ['birthday'], description: 'birthday cake' },
  });

  const results = await searchAssetIntelligence({
    db: fakeDb({ media }),
    userId: 'u1',
    query: 'birthday cake',
  });

  assert.equal(results.length, 1, 'the only real match should be returned');
  assert.equal(results[0].id, 'old-birthday', 'an old photo must still be findable');
});

test('near-miss matches are not returned just because they are starred', async () => {
  // The database matches loosely, so "carpet" is fetched; a starred, ready
  // asset scores above zero on bonuses alone and used to surface anyway.
  const media = [{
    id: 'carpet',
    userId: 'u1',
    name: 'rug.jpg',
    favorite: true,
    createdAt: new Date(),
    aiAnalysis: { tags: ['carpet'], description: 'a nice carpet' },
  }];

  const results = await searchAssetIntelligence({ db: fakeDb({ media }), userId: 'u1', query: 'car' });
  assert.deepEqual(results, [], 'a carpet is not a car');
});
