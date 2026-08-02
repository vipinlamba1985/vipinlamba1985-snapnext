// Semantic ("smart") search — the parts that cost nothing.
//
// This module deliberately has no imports, in the same spirit as lib/triage.js
// and lib/post-composer.js: building the text to embed, comparing vectors and
// fusing rankings are pure functions over data the user already owns, so they
// can run over a large library without reaching a provider. Only
// lib/search-embeddings.server.js may call a model, and only through the spend
// gate.
//
// The economics that make this worth doing: the expensive step — a vision model
// describing each photo — has already been paid for, and its output is sitting
// in `aiAnalysis` and `asset_intelligence`. Smart search embeds that existing
// text. It never looks at an image.

/** Embedding model and width. 256 dimensions keeps storage at ~1KB per photo. */
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 256;

/** Schema version, so a change to the text or model can be re-indexed cleanly. */
export const EMBEDDING_VERSION = 'smart-search-v1';

/** $0.02 per 1M tokens. Kept here so the estimate and the charge cannot drift. */
export const EMBEDDING_USD_PER_1K_TOKENS = 0.00002;

/** Characters of embedding text kept per asset. Roughly 200 tokens. */
export const MAX_EMBEDDING_CHARS = 800;

/**
 * Fields worth embedding, most meaningful first.
 *
 * Order matters: the text is truncated from the end, so a caption survives and
 * a long OCR dump does not push it out. Filenames are deliberately absent —
 * "IMG_4021.jpg" carries no meaning and only blurs the vector. Exact tokens
 * like that are the keyword leg's job.
 */
function meaningfulParts(media = {}, intelligence = null) {
  const ai = media.aiAnalysis || {};
  const source = intelligence || {};
  return [
    source.summary || ai.summary,
    source.description || ai.description || ai.caption,
    source.autoAlbum || ai.autoAlbum,
    ...(source.topics || ai.tags || []),
    ...(source.people || ai.people || []),
    ...(source.places || ai.locations || []),
    ...(source.objects || ai.objects || []),
    ...(source.activities || ai.activities || []),
    ...(ai.emotions || []),
    source.contentType || ai.contentType,
    source.ocrText || ai.textInside,
  ];
}

/**
 * Builds the text embedded for one asset. Returns '' when there is nothing
 * meaningful to embed, which is the signal not to spend anything on it.
 */
export function buildEmbeddingText(media = {}, intelligence = null) {
  const seen = new Set();
  const parts = [];

  for (const part of meaningfulParts(media, intelligence)) {
    const value = String(part || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(value);
  }

  return parts.join('. ').slice(0, MAX_EMBEDDING_CHARS).trim();
}

/** True when an asset has enough description to be worth embedding. */
export function isWorthEmbedding(media = {}, intelligence = null) {
  return buildEmbeddingText(media, intelligence).length >= 12;
}

/**
 * Scales a vector to unit length so similarity is a plain dot product at query
 * time. Storing normalised vectors moves that work off the hot path.
 */
export function normalizeVector(vector = []) {
  const values = (Array.isArray(vector) ? vector : []).map(Number).map(v => (Number.isFinite(v) ? v : 0));
  const magnitude = Math.sqrt(values.reduce((total, value) => total + value * value, 0));
  if (!magnitude) return values.map(() => 0);
  return values.map(value => value / magnitude);
}

/**
 * Cosine similarity, in [-1, 1]. Mismatched lengths return 0 rather than
 * comparing across schema versions and producing a confident wrong answer.
 */
export function cosineSimilarity(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = Number(a[index]) || 0;
    const right = Number(b[index]) || 0;
    dot += left * right;
    magA += left * left;
    magB += right * right;
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Estimated token count. Deliberately generous so the reservation never underestimates. */
export function estimateTokens(text = '') {
  return Math.ceil(String(text || '').length / 3);
}

/** Estimated USD for embedding these texts, used for the spend reservation. */
export function estimateEmbeddingCostUsd(texts = []) {
  const tokens = (Array.isArray(texts) ? texts : []).reduce((total, text) => total + estimateTokens(text), 0);
  return (tokens / 1000) * EMBEDDING_USD_PER_1K_TOKENS;
}

/**
 * Reciprocal Rank Fusion.
 *
 * Combines the keyword and semantic rankings without needing their scores to be
 * on the same scale — the only thing compared is position. This is what keeps
 * smart search precise: pure vector search is weak on exact tokens (names,
 * "IMG_4021", dates) and keyword search is blind to meaning, so each covers the
 * other's failure. An id missing from one list simply scores nothing there,
 * which is why the fusion degrades gracefully when a library is only partly
 * embedded.
 *
 * `k` damps the influence of top ranks; 60 is the standard default.
 */
export function fuseRankings(rankings = [], { k = 60, weights = [] } = {}) {
  const scores = new Map();

  (Array.isArray(rankings) ? rankings : []).forEach((ranking, listIndex) => {
    const weight = Number.isFinite(Number(weights[listIndex])) ? Number(weights[listIndex]) : 1;
    (Array.isArray(ranking) ? ranking : []).forEach((id, rank) => {
      const key = String(id);
      if (!key) return;
      scores.set(key, (scores.get(key) || 0) + weight * (1 / (k + rank + 1)));
    });
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, score]) => ({ id, score }));
}

/**
 * Ranks stored vectors against a query vector.
 * `minScore` drops weak neighbours: without a floor, vector search always
 * returns something, so an unrelated query would still fill the page.
 */
export function rankBySimilarity(queryVector = [], entries = [], { limit = 50, minScore = 0.2 } = {}) {
  return (Array.isArray(entries) ? entries : [])
    .map(entry => ({ id: entry?.id, score: cosineSimilarity(queryVector, entry?.vector || []) }))
    .filter(entry => entry.id && entry.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}
