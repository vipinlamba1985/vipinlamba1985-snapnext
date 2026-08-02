// Smart search: semantic ranking fused with keyword ranking.
//
// The properties that matter are that it costs nothing to run the pure parts,
// that it never charges for a photo with nothing worth embedding, and that a
// library with no embeddings behaves exactly as it did before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_VERSION,
  buildEmbeddingText,
  cosineSimilarity,
  estimateEmbeddingCostUsd,
  fuseRankings,
  isWorthEmbedding,
  normalizeVector,
  rankBySimilarity,
} from '../lib/search-embeddings.js';
import { searchAssetIntelligence } from '../lib/ai-memory-retrieval.js';
import { CREATIVE_BILLING, CREATIVE_FEATURES } from '../lib/creative-credits.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the pure module reaches no provider', async () => {
  // Same guarantee as triage.js: no imports means it cannot spend money, so it
  // is safe to run over a whole library.
  const source = await readFile(path.join(repoRoot, 'lib', 'search-embeddings.js'), 'utf8');
  assert.doesNotMatch(source, /^import /m, 'the pure search module must stay import-free');
  assert.doesNotMatch(source, /fetch\(/, 'the pure search module must not call out');
});

test('embedding text uses descriptions, not filenames', () => {
  const text = buildEmbeddingText({
    name: 'IMG_4021.jpg',
    aiAnalysis: { caption: 'Two children on a sandy beach', tags: ['beach', 'summer'], locations: ['Goa'] },
  });

  assert.match(text, /sandy beach/);
  assert.match(text, /Goa/);
  // A filename carries no meaning and only blurs the vector.
  assert.doesNotMatch(text, /IMG_4021/);
});

test('duplicate wording is not embedded twice', () => {
  const text = buildEmbeddingText({ aiAnalysis: { caption: 'Birthday', tags: ['birthday', 'Birthday'] } });
  assert.equal(text.toLowerCase().split('birthday').length - 1, 1);
});

test('photos with nothing described are never worth paying for', () => {
  assert.equal(isWorthEmbedding({ name: 'IMG_1.jpg' }), false);
  assert.equal(isWorthEmbedding({ name: 'IMG_1.jpg', aiAnalysis: {} }), false);
  assert.equal(isWorthEmbedding({ aiAnalysis: { caption: 'A dog running on grass' } }), true);
});

test('indexing a whole library costs cents, not dollars', () => {
  // 10,000 photos with a typical description each.
  const texts = Array.from({ length: 10000 }, () => 'Two children on a sandy beach at sunset. beach. summer. Goa');
  const cost = estimateEmbeddingCostUsd(texts);
  assert.ok(cost < 0.05, `expected under $0.05 for 10k photos, got $${cost.toFixed(4)}`);
  assert.ok(cost > 0, 'cost must not be reported as free');
});

test('similarity is bounded and direction-sensitive', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  // Different widths mean different schema versions — never guess.
  assert.equal(cosineSimilarity([1, 0], [1, 0, 0]), 0);
  assert.equal(cosineSimilarity([], []), 0);
});

test('normalising makes vectors unit length', () => {
  const unit = normalizeVector([3, 4]);
  assert.equal(Math.round(Math.hypot(...unit) * 1000) / 1000, 1);
  // A zero vector must not produce NaN.
  assert.deepEqual(normalizeVector([0, 0]), [0, 0]);
});

test('weak semantic neighbours are dropped rather than filling the page', () => {
  const ranked = rankBySimilarity([1, 0], [
    { id: 'close', vector: [0.99, 0.14] },
    { id: 'unrelated', vector: [0, 1] },
  ]);
  assert.deepEqual(ranked.map(entry => entry.id), ['close']);
});

test('fusion combines rankings without needing comparable scores', () => {
  const fused = fuseRankings([['a', 'b', 'c'], ['c', 'b', 'z']]);
  const ids = fused.map(entry => entry.id);
  // 'b' places well in both lists, so it must beat items strong in only one.
  assert.ok(ids.indexOf('b') < ids.indexOf('a'), 'agreement across both legs should win');
  assert.ok(ids.includes('z'), 'a semantic-only hit must still appear');
});

test('smart search is metered, never declared free', () => {
  for (const id of ['smart_search_index', 'smart_search_query']) {
    const feature = CREATIVE_FEATURES[id];
    assert.ok(feature, `${id} must be declared in creative-credits`);
    assert.equal(feature.billing, CREATIVE_BILLING.METERED, `${id} calls a model, so it must be metered`);
  }
});

test('the server module reserves spend before calling the provider', async () => {
  const source = await readFile(path.join(repoRoot, 'lib', 'search-embeddings.server.js'), 'utf8');
  assert.match(source, /reserveExternalAiSpend/);
  assert.match(source, /settleExternalAiSpend/);
  assert.match(source, /releaseExternalAiSpend/);
  // A failed provider call must give the money back.
  assert.match(source, /catch[\s\S]*releaseExternalAiSpend/);
  assert.ok(
    source.indexOf('reserveExternalAiSpend') < source.indexOf('callEmbeddingProvider(inputs)'),
    'spend must be reserved before the provider is called',
  );
});

/** Minimal in-memory stand-in for the collections search reads. */
function fakeDb({ media = [], intelligence = [], embeddings = [] }) {
  const match = (doc, query) => Object.entries(query).every(([key, condition]) => {
    if (key === '$or') return condition.some(clause => match(doc, clause));
    const value = key.split('.').reduce((node, part) => (node == null ? node : node[part]), doc);
    if (condition instanceof RegExp) {
      const flat = Array.isArray(value) ? value.join(' ') : value;
      return typeof flat === 'string' && condition.test(flat);
    }
    if (condition && typeof condition === 'object') {
      if ('$ne' in condition) return value !== condition.$ne;
      if ('$in' in condition) return condition.$in.includes(value);
    }
    return value === condition;
  });

  const cursor = rows => ({
    sort: () => cursor(rows),
    limit: n => cursor(rows.slice(0, n)),
    toArray: async () => rows,
  });

  const collections = { media, asset_intelligence: intelligence, media_embeddings: embeddings };
  return {
    collection: name => ({
      find: query => cursor((collections[name] || []).filter(doc => match(doc, query))),
    }),
  };
}

const seaside = {
  id: 'seaside',
  userId: 'u1',
  name: 'IMG_9.jpg',
  createdAt: new Date('2020-01-01'),
  aiAnalysis: { description: 'waves on the seaside at sunset', tags: ['seaside'] },
};

test('without embeddings, search behaves exactly as keyword search did', async () => {
  const results = await searchAssetIntelligence({
    db: fakeDb({ media: [seaside] }),
    userId: 'u1',
    query: 'beach',
  });
  // "beach" does not appear in the text, and nothing was embedded, so no match.
  assert.deepEqual(results, []);
});

test('a semantic match surfaces a photo keyword search cannot find', async () => {
  const results = await searchAssetIntelligence({
    db: fakeDb({
      media: [seaside],
      embeddings: [{ userId: 'u1', mediaId: 'seaside', version: EMBEDDING_VERSION, vector: [1, 0] }],
    }),
    userId: 'u1',
    query: 'beach',
    queryVector: [0.98, 0.2],
  });

  assert.equal(results.length, 1, '"beach" should find a photo described as "seaside"');
  assert.equal(results[0].id, 'seaside');
  assert.equal(results[0].matchedBy, 'meaning');
});

test('an exact word match still outranks a merely similar one', async () => {
  const literal = {
    id: 'literal',
    userId: 'u1',
    name: 'IMG_1.jpg',
    createdAt: new Date('2024-01-01'),
    aiAnalysis: { description: 'a day at the beach', tags: ['beach'] },
  };

  const results = await searchAssetIntelligence({
    db: fakeDb({
      media: [literal, seaside],
      embeddings: [
        { userId: 'u1', mediaId: 'seaside', version: EMBEDDING_VERSION, vector: [1, 0] },
        { userId: 'u1', mediaId: 'literal', version: EMBEDDING_VERSION, vector: [0.9, 0.4] },
      ],
    }),
    userId: 'u1',
    query: 'beach',
    queryVector: [1, 0],
  });

  assert.equal(results[0].id, 'literal', 'the photo actually tagged "beach" must rank first');
  assert.equal(results[0].matchedBy, 'both');
});

test('stored vectors are the width the model is asked for', () => {
  assert.equal(EMBEDDING_DIMENSIONS, 256);
});
