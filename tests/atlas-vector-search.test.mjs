import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ATLAS_VECTOR_CANDIDATE_MULTIPLIER,
  ATLAS_VECTOR_INDEX_ENV,
  ATLAS_VECTOR_PATH,
  atlasVectorNumCandidates,
  atlasVectorResultLimit,
  buildAtlasVectorSearchPipeline,
  configuredAtlasVectorIndex,
  normalizeAtlasVectorIndexName,
} from '../lib/atlas-vector-search.js';
import { EMBEDDING_DIMENSIONS, EMBEDDING_VERSION } from '../lib/search-embeddings.js';
import { SEMANTIC_SCAN_CAP, semanticRanking } from '../lib/ai-memory-retrieval.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function withAtlasIndex(value, fn) {
  const previous = process.env[ATLAS_VECTOR_INDEX_ENV];
  if (value == null) delete process.env[ATLAS_VECTOR_INDEX_ENV];
  else process.env[ATLAS_VECTOR_INDEX_ENV] = value;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous == null) delete process.env[ATLAS_VECTOR_INDEX_ENV];
      else process.env[ATLAS_VECTOR_INDEX_ENV] = previous;
    });
}

function cursor(rows) {
  return {
    sort: () => cursor(rows),
    limit: n => cursor(rows.slice(0, n)),
    toArray: async () => rows,
  };
}

function vectorDb({ aggregateRows = [], scanRows = [], aggregateError = null } = {}) {
  const state = { aggregateCalls: 0, findCalls: 0, pipeline: null, findQuery: null };
  return {
    state,
    db: {
      collection(name) {
        assert.equal(name, 'media_embeddings');
        return {
          aggregate(pipeline) {
            state.aggregateCalls += 1;
            state.pipeline = pipeline;
            return {
              toArray: async () => {
                if (aggregateError) throw aggregateError;
                return aggregateRows;
              },
            };
          },
          find(query) {
            state.findCalls += 1;
            state.findQuery = query;
            return cursor(scanRows);
          },
        };
      },
    },
  };
}

test('Atlas vector helper stays import-free and configuration-only', async () => {
  const source = await readFile(path.join(repoRoot, 'lib', 'atlas-vector-search.js'), 'utf8');
  assert.doesNotMatch(source, /^import /m);
  assert.doesNotMatch(source, /fetch\(/);
  assert.equal(normalizeAtlasVectorIndexName(' snapnext_smart_search_v1 '), 'snapnext_smart_search_v1');
  assert.equal(normalizeAtlasVectorIndexName('bad index name'), '');
  assert.equal(configuredAtlasVectorIndex({ [ATLAS_VECTOR_INDEX_ENV]: 'safe_index' }), 'safe_index');
});

test('$vectorSearch is first and tenant/version isolation happens inside it', () => {
  const pipeline = buildAtlasVectorSearchPipeline({
    indexName: 'snapnext_smart_search_v1',
    userId: 'u1',
    version: EMBEDDING_VERSION,
    queryVector: [1, 0],
    limit: 20,
  });

  assert.ok(Array.isArray(pipeline));
  assert.equal(Object.keys(pipeline[0])[0], '$vectorSearch', '$vectorSearch must be the first aggregation stage');
  assert.equal(pipeline[0].$vectorSearch.index, 'snapnext_smart_search_v1');
  assert.equal(pipeline[0].$vectorSearch.path, ATLAS_VECTOR_PATH);
  assert.deepEqual(pipeline[0].$vectorSearch.filter, {
    $and: [{ userId: 'u1' }, { version: EMBEDDING_VERSION }],
  });
  assert.equal(pipeline.some(stage => stage.$match), false, 'tenant isolation must not be deferred to a post-filter');
  assert.deepEqual(pipeline[1].$project, { _id: 0, mediaId: 1, vector: 1 });
});

test('ANN candidate budget follows MongoDB starting guidance and stays bounded', () => {
  const resultLimit = atlasVectorResultLimit(20);
  const numCandidates = atlasVectorNumCandidates(resultLimit);
  assert.ok(numCandidates >= resultLimit * ATLAS_VECTOR_CANDIDATE_MULTIPLIER);
  assert.equal(ATLAS_VECTOR_CANDIDATE_MULTIPLIER, 20);
  assert.equal(atlasVectorResultLimit(5000), 150);
  assert.equal(atlasVectorNumCandidates(150), 3000);
});

test('Atlas index definition matches the stored embedding contract', async () => {
  const definition = JSON.parse(await readFile(path.join(repoRoot, 'docs', 'atlas', 'smart-search-vector-index.json'), 'utf8'));
  const vector = definition.fields.find(field => field.type === 'vector');
  const filters = definition.fields.filter(field => field.type === 'filter').map(field => field.path).sort();

  assert.deepEqual(vector, {
    type: 'vector',
    path: 'vector',
    numDimensions: EMBEDDING_DIMENSIONS,
    similarity: 'cosine',
  });
  assert.deepEqual(filters, ['userId', 'version']);
});

test('configured Atlas search replaces the 25k application scan and preserves the exact cosine floor', async () => {
  await withAtlasIndex('snapnext_smart_search_v1', async () => {
    const { db, state } = vectorDb({
      aggregateRows: [
        { mediaId: 'strong', vector: [1, 0] },
        { mediaId: 'weak', vector: [0, 1] },
      ],
      scanRows: [{ userId: 'u1', version: EMBEDDING_VERSION, mediaId: 'should-not-scan', vector: [1, 0] }],
    });

    const results = await semanticRanking(db, 'u1', [1, 0], 20);
    assert.deepEqual(results.map(item => item.id), ['strong']);
    assert.equal(state.aggregateCalls, 1);
    assert.equal(state.findCalls, 0, 'Atlas success must not scan stored vectors in application memory');
    assert.deepEqual(state.pipeline[0].$vectorSearch.filter, {
      $and: [{ userId: 'u1' }, { version: EMBEDDING_VERSION }],
    });
  });
});

test('an unavailable Atlas index fails soft to the existing bounded scan', async () => {
  await withAtlasIndex('snapnext_smart_search_v1', async () => {
    const { db, state } = vectorDb({
      aggregateError: new Error('index not queryable'),
      scanRows: [
        { userId: 'u1', version: EMBEDDING_VERSION, mediaId: 'fallback', vector: [1, 0] },
      ],
    });

    const results = await semanticRanking(db, 'u1', [1, 0], 20);
    assert.deepEqual(results.map(item => item.id), ['fallback']);
    assert.equal(state.aggregateCalls, 1);
    assert.equal(state.findCalls, 1);
    assert.deepEqual(state.findQuery, { userId: 'u1', version: EMBEDDING_VERSION });
    assert.equal(SEMANTIC_SCAN_CAP, 25000, 'compatibility fallback stays explicitly bounded');
  });
});

test('without Atlas configuration Smart Search keeps the existing self-hosted-compatible path', async () => {
  await withAtlasIndex(null, async () => {
    const { db, state } = vectorDb({
      scanRows: [{ userId: 'u1', version: EMBEDDING_VERSION, mediaId: 'legacy', vector: [1, 0] }],
    });
    const results = await semanticRanking(db, 'u1', [1, 0], 20);
    assert.deepEqual(results.map(item => item.id), ['legacy']);
    assert.equal(state.aggregateCalls, 0);
    assert.equal(state.findCalls, 1);
  });
});
