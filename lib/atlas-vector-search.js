// MongoDB Atlas Vector Search query construction for Smart Search.
//
// This module is intentionally import-free. It only builds a bounded aggregation
// pipeline; provider calls, billing, and the embedding model remain owned by the
// existing Smart Search modules.

export const ATLAS_VECTOR_INDEX_ENV = 'SMART_SEARCH_ATLAS_VECTOR_INDEX';
export const ATLAS_VECTOR_PATH = 'vector';
export const ATLAS_VECTOR_USER_FIELD = 'userId';
export const ATLAS_VECTOR_VERSION_FIELD = 'version';
export const ATLAS_VECTOR_MIN_RESULTS = 50;
export const ATLAS_VECTOR_MAX_RESULTS = 150;
export const ATLAS_VECTOR_CANDIDATE_MULTIPLIER = 20;
export const ATLAS_VECTOR_MAX_CANDIDATES = 3000;

/**
 * Atlas index names are configuration, not user input. Still keep the accepted
 * shape deliberately narrow so an accidental value cannot become aggregation
 * syntax or an unbounded identifier.
 */
export function normalizeAtlasVectorIndexName(value) {
  const name = String(value || '').trim();
  if (!name) return '';
  return /^[A-Za-z0-9_-]{1,128}$/.test(name) ? name : '';
}

export function configuredAtlasVectorIndex(env = process.env) {
  return normalizeAtlasVectorIndexName(env?.[ATLAS_VECTOR_INDEX_ENV]);
}

export function atlasVectorResultLimit(requested = 20) {
  const numeric = Math.max(1, Math.min(50, Number(requested) || 20));
  return Math.max(ATLAS_VECTOR_MIN_RESULTS, Math.min(ATLAS_VECTOR_MAX_RESULTS, numeric * 3));
}

export function atlasVectorNumCandidates(resultLimit) {
  const bounded = Math.max(1, Math.min(ATLAS_VECTOR_MAX_RESULTS, Number(resultLimit) || ATLAS_VECTOR_MIN_RESULTS));
  return Math.min(ATLAS_VECTOR_MAX_CANDIDATES, Math.max(100, bounded * ATLAS_VECTOR_CANDIDATE_MULTIPLIER));
}

function validQueryVector(queryVector) {
  if (!Array.isArray(queryVector) || !queryVector.length) return null;
  const vector = queryVector.map(Number);
  return vector.every(Number.isFinite) ? vector : null;
}

/**
 * Builds the complete Atlas ANN pipeline.
 *
 * Tenant and schema-version filters deliberately live INSIDE `$vectorSearch`.
 * Applying either one later would let the nearest-neighbour stage spend its
 * result budget on another user or another embedding version before those rows
 * were discarded.
 */
export function buildAtlasVectorSearchPipeline({
  indexName,
  userId,
  version,
  queryVector,
  limit = 20,
} = {}) {
  const index = normalizeAtlasVectorIndexName(indexName);
  const vector = validQueryVector(queryVector);
  const owner = String(userId || '').trim();
  const schemaVersion = String(version || '').trim();
  if (!index || !vector || !owner || !schemaVersion) return null;

  const resultLimit = atlasVectorResultLimit(limit);
  const numCandidates = atlasVectorNumCandidates(resultLimit);

  return [
    {
      $vectorSearch: {
        index,
        path: ATLAS_VECTOR_PATH,
        queryVector: vector,
        numCandidates,
        limit: resultLimit,
        filter: {
          $and: [
            { [ATLAS_VECTOR_USER_FIELD]: owner },
            { [ATLAS_VECTOR_VERSION_FIELD]: schemaVersion },
          ],
        },
      },
    },
    {
      // Keep the stored vector for the small candidate set only. SnapNext then
      // applies the same exact cosine threshold it used before Atlas, so moving
      // the nearest-neighbour work into MongoDB does not silently change search
      // quality or fill the page with weak semantic neighbours.
      $project: {
        _id: 0,
        mediaId: 1,
        vector: 1,
      },
    },
  ];
}
