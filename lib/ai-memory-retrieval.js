// Relative import keeps this module loadable by the Node test runner, which
// does not resolve the `@/` alias.
import { ASSET_INTELLIGENCE_PIPELINE_VERSION } from './asset-intelligence-version.js';
import { buildAtlasVectorSearchPipeline, configuredAtlasVectorIndex } from './atlas-vector-search.js';
import { EMBEDDING_VERSION, fuseRankings, rankBySimilarity } from './search-embeddings.js';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'make', 'create', 'write', 'draft', 'help', 'please',
  'photo', 'photos', 'picture', 'pictures', 'video', 'videos', 'memory', 'memories', 'recent', 'latest', 'saved',
  'les', 'des', 'une', 'pour', 'avec', 'dans', 'sur', 'mes', 'mon', 'ma', 'trouve', 'chercher', 'recherche', 'souvenir', 'souvenirs',
]);

export function memorySearchTerms(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term))
    .slice(0, 14);
}

function legacyText(media) {
  return [
    media.name,
    media.kind,
    media.aiAnalysis?.autoAlbum,
    media.aiAnalysis?.description,
    media.aiAnalysis?.summary,
    media.aiAnalysis?.textInside,
    ...(media.aiAnalysis?.tags || []),
    ...(media.aiAnalysis?.faces || []),
    ...(media.aiAnalysis?.locations || []),
    ...(media.aiAnalysis?.objects || []),
    ...(media.aiAnalysis?.activities || []),
    ...(media.aiAnalysis?.searchQueries || []),
    ...(media.aiAnalysis?.actionCandidates || []).map((item) => item?.action),
    ...(media.aiAnalysis?.taskCandidates || []).map((item) => item?.title),
  ].filter(Boolean).join(' ').toLowerCase();
}

function intelligenceText(intelligence) {
  if (!intelligence) return '';
  return intelligence.searchText || [
    intelligence.name,
    intelligence.contentType,
    intelligence.documentType,
    intelligence.summary,
    intelligence.description,
    intelligence.ocrText,
    intelligence.autoAlbum,
    ...(intelligence.topics || []),
    ...(intelligence.people || []),
    ...(intelligence.organizations || []),
    ...(intelligence.places || []),
    ...(intelligence.objects || []),
    ...(intelligence.activities || []),
    ...(intelligence.searchQueries || []),
    ...(intelligence.actionCandidates || []).map((item) => item?.action),
    ...(intelligence.taskCandidates || []).map((item) => item?.title),
  ].filter(Boolean).join(' ').toLowerCase();
}

/** Minimum term length before prefix matching is allowed. */
const MIN_PREFIX_TERM_LENGTH = 4;

/**
 * Splits text into whole words using the same rules as `memorySearchTerms`, so
 * a query term and the text it is matched against are tokenised identically.
 */
export function textTokens(text) {
  const tokens = new Set();
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const word of words) {
    tokens.add(word);
    // Hyphenated text is kept whole (query terms keep their hyphens too, so
    // "beach-day" still matches) but its parts are added as well, so searching
    // "day" finds a photo tagged "beach-day".
    if (word.includes('-')) for (const part of word.split('-')) if (part) tokens.add(part);
  }
  return tokens;
}

/**
 * Whole-word (or prefix) matching.
 *
 * This used to be `text.includes(term)`, which matched anywhere inside a word:
 * searching "car" returned photos tagged "carpet", "scarf" and "Carol". Matching
 * tokens instead fixes that. Prefixes are still allowed for longer terms so
 * "birthday" keeps finding "birthdays", but a three-letter term must match a
 * whole word — which is exactly the case that produced the bad results.
 */
function termMatch(term, tokens) {
  if (tokens.has(term)) return 'exact';
  if (term.length < MIN_PREFIX_TERM_LENGTH) return null;
  for (const token of tokens) {
    if (token.length > term.length && token.startsWith(term)) return 'prefix';
  }
  return null;
}

/** How many query terms genuinely matched this asset as whole words. */
export function matchedTermCount({ media, intelligence, terms }) {
  const tokens = textTokens(`${legacyText(media)} ${intelligenceText(intelligence)}`);
  return terms.filter((term) => termMatch(term, tokens)).length;
}

function scoreAsset({ media, intelligence, terms }) {
  const tokens = textTokens(`${legacyText(media)} ${intelligenceText(intelligence)}`);
  const nameTokens = textTokens(media.name);
  let score = 0;
  for (const term of terms) {
    const match = termMatch(term, tokens);
    if (match === 'exact') score += 10;
    else if (match === 'prefix') score += 6;
    if (termMatch(term, nameTokens)) score += 3;
  }
  if (intelligence?.status === 'ready') score += 6;
  else if (intelligence?.status === 'partial') score += 2;
  if (media.favorite || media.isFavorite) score += 5;
  if (intelligence?.taskCandidates?.length) score += 2;
  if (intelligence?.actionCandidates?.length) score += 2;
  if (media.aiAnalysis?.description || intelligence?.description) score += 2;
  const created = new Date(media.createdAt || 0).getTime();
  if (Number.isFinite(created)) score += Math.max(0, 2 - (Date.now() - created) / (1000 * 60 * 60 * 24 * 180));
  return score;
}

function compactAsset(media, intelligence) {
  const ai = media.aiAnalysis || {};
  return {
    id: media.id,
    name: String(media.name || '').slice(0, 100),
    kind: media.kind,
    createdAt: media.createdAt,
    favorite: !!(media.favorite || media.isFavorite),
    indexed: Boolean(intelligence),
    intelligenceStatus: intelligence?.status || ai.intelligenceStatus || null,
    contentType: intelligence?.contentType || ai.contentType || media.kind,
    documentType: intelligence?.documentType || ai.documentType || null,
    summary: String(intelligence?.summary || ai.summary || ai.description || '').slice(0, 420),
    description: String(intelligence?.description || ai.description || '').slice(0, 420),
    ocrText: String(intelligence?.ocrText || ai.textInside || '').slice(0, 700),
    topics: (intelligence?.topics || ai.tags || []).slice(0, 10),
    people: (intelligence?.people || ai.faces || []).slice(0, 8),
    organizations: (intelligence?.organizations || ai.organizations || []).slice(0, 8),
    places: (intelligence?.places || ai.locations || []).slice(0, 8),
    objects: (intelligence?.objects || ai.objects || []).slice(0, 10),
    activities: (intelligence?.activities || ai.activities || []).slice(0, 10),
    album: intelligence?.autoAlbum || ai.autoAlbum || '',
    importantDates: (intelligence?.importantDates || ai.importantDates || []).slice(0, 6),
    actionCandidates: (intelligence?.actionCandidates || ai.actionCandidates || []).slice(0, 6),
    taskCandidates: (intelligence?.taskCandidates || ai.taskCandidates || []).slice(0, 6),
    searchQueries: (intelligence?.searchQueries || ai.searchQueries || []).slice(0, 8),
  };
}

async function loadCandidates(db, userId, limit = 220) {
  const media = await db.collection('media')
    .find({ userId, trashed: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  if (!media.length) return { media: [], intelligenceByMediaId: new Map() };
  const mediaIds = media.map((item) => item.id);
  const intelligence = await db.collection('asset_intelligence').find({
    userId,
    mediaId: { $in: mediaIds },
    pipelineVersion: ASSET_INTELLIGENCE_PIPELINE_VERSION,
  }).toArray();
  return {
    media,
    intelligenceByMediaId: new Map(intelligence.map((item) => [item.mediaId, item])),
  };
}

/** Fields carrying searchable text on a media document. */
const MEDIA_SEARCH_FIELDS = [
  'name', 'kind',
  'aiAnalysis.autoAlbum', 'aiAnalysis.description', 'aiAnalysis.summary', 'aiAnalysis.textInside',
  'aiAnalysis.tags', 'aiAnalysis.faces', 'aiAnalysis.locations', 'aiAnalysis.objects',
  'aiAnalysis.activities', 'aiAnalysis.searchQueries',
];

/** Fields carrying searchable text on an asset_intelligence document. */
const INTELLIGENCE_SEARCH_FIELDS = [
  'searchText', 'name', 'summary', 'description', 'ocrText', 'autoAlbum', 'contentType',
  'documentType', 'topics', 'people', 'organizations', 'places', 'objects', 'activities',
  'searchQueries',
];

/** How many matching documents a single search may pull into memory. */
const SEARCH_CANDIDATE_CAP = 1000;

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function anyTermMatches(fields, terms) {
  // Terms are escaped, so user input stays literal rather than executable regex.
  const patterns = terms.map((term) => new RegExp(escapeRegex(term), 'i'));
  return fields.flatMap((field) => patterns.map((pattern) => ({ [field]: pattern })));
}

/**
 * Finds every photo in the library that could match, rather than only the most
 * recent ones.
 *
 * The old behaviour loaded the 220 newest photos and scored those, so on a
 * 5,000-photo library roughly 96% of it could not be found by any query at all.
 * Now the database does cheap, broad recall across the whole library and the
 * scorer above does the precise part — over-fetching here is harmless because
 * `termMatch` rejects the near-misses.
 */
async function loadSearchCandidates(db, userId, terms) {
  if (!terms.length) return loadCandidates(db, userId);

  const scope = { userId, trashed: { $ne: true } };
  const [media, intelligenceMatches] = await Promise.all([
    db.collection('media')
      .find({ ...scope, $or: anyTermMatches(MEDIA_SEARCH_FIELDS, terms) })
      .sort({ createdAt: -1 })
      .limit(SEARCH_CANDIDATE_CAP)
      .toArray(),
    db.collection('asset_intelligence')
      .find({
        userId,
        pipelineVersion: ASSET_INTELLIGENCE_PIPELINE_VERSION,
        $or: anyTermMatches(INTELLIGENCE_SEARCH_FIELDS, terms),
      })
      .limit(SEARCH_CANDIDATE_CAP)
      .toArray(),
  ]);

  // A photo can match only through its intelligence record, so pull in any
  // media the first query missed rather than silently dropping it.
  const seen = new Set(media.map((item) => item.id));
  const missingIds = intelligenceMatches
    .map((item) => item.mediaId)
    .filter((id) => id && !seen.has(id));

  if (missingIds.length) {
    const extra = await db.collection('media')
      .find({ ...scope, id: { $in: missingIds.slice(0, SEARCH_CANDIDATE_CAP) } })
      .toArray();
    media.push(...extra);
  }

  if (!media.length) return { media: [], intelligenceByMediaId: new Map() };

  // Intelligence for candidates matched on media fields alone is still needed
  // for scoring, so fetch whatever the first pass did not already return.
  const haveIntelligence = new Set(intelligenceMatches.map((item) => item.mediaId));
  const needIntelligence = media.map((item) => item.id).filter((id) => !haveIntelligence.has(id));
  const rest = needIntelligence.length
    ? await db.collection('asset_intelligence').find({
      userId,
      mediaId: { $in: needIntelligence },
      pipelineVersion: ASSET_INTELLIGENCE_PIPELINE_VERSION,
    }).toArray()
    : [];

  return {
    media,
    intelligenceByMediaId: new Map([...intelligenceMatches, ...rest].map((item) => [item.mediaId, item])),
  };
}

/**
 * Legacy in-process semantic scan cap.
 *
 * Atlas Vector Search removes this ceiling when `SMART_SEARCH_ATLAS_VECTOR_INDEX`
 * is configured and queryable. The capped scan remains as a compatibility and
 * outage fallback for local/self-hosted MongoDB or an unavailable Atlas index.
 */
export const SEMANTIC_SCAN_CAP = 25000;

async function scanSemanticRanking(db, userId, queryVector, limit) {
  const rows = await db.collection('media_embeddings')
    .find(
      { userId, version: EMBEDDING_VERSION },
      { projection: { mediaId: 1, vector: 1, _id: 0 } },
    )
    .sort({ updatedAt: -1 })
    .limit(SEMANTIC_SCAN_CAP)
    .toArray();

  return rankBySimilarity(
    queryVector,
    rows.map((row) => ({ id: row.mediaId, vector: row.vector })),
    { limit: Math.max(limit * 3, 50) },
  );
}

/**
 * Ranks the user's stored vectors against an embedded query.
 *
 * When an Atlas Vector Search index is configured, MongoDB performs the ANN
 * candidate search with `userId` and embedding `version` pre-filtered inside the
 * first `$vectorSearch` stage. SnapNext then applies the same exact cosine
 * threshold to only that bounded candidate set. Any Atlas/index/runtime error
 * falls back to the existing capped scan so semantic search never becomes a
 * launch dependency.
 */
export async function semanticRanking(db, userId, queryVector, limit) {
  if (!Array.isArray(queryVector) || !queryVector.length) return [];

  const atlasIndex = configuredAtlasVectorIndex();
  if (atlasIndex) {
    const pipeline = buildAtlasVectorSearchPipeline({
      indexName: atlasIndex,
      userId,
      version: EMBEDDING_VERSION,
      queryVector,
      limit,
    });

    if (pipeline) {
      try {
        const rows = await db.collection('media_embeddings').aggregate(pipeline).toArray();
        return rankBySimilarity(
          queryVector,
          rows.map((row) => ({ id: row.mediaId, vector: row.vector })),
          { limit: Math.max(limit * 3, 50) },
        );
      } catch {
        // Missing/building indexes, unsupported local MongoDB, or transient
        // Atlas errors must not make Library search fail. The old bounded path
        // remains deliberately available as a compatibility fallback.
      }
    }
  }

  return scanSemanticRanking(db, userId, queryVector, limit);
}

/**
 * Searches the library.
 *
 * Keyword-only by default. When `queryVector` is supplied — the caller having
 * paid to embed the query — the semantic ranking is fused with the keyword
 * ranking so meaning and exact wording both count. Keeping the provider call
 * outside this module means search never spends anything on its own, and a
 * library with no embeddings behaves exactly as it did before.
 */
export async function searchAssetIntelligence({ db, userId, query, limit = 20, queryVector = null }) {
  const terms = memorySearchTerms(query);
  const size = Math.max(1, Math.min(50, Number(limit) || 20));
  const { media, intelligenceByMediaId } = await loadSearchCandidates(db, userId, terms);

  const scored = media.map((item) => {
    const intelligence = intelligenceByMediaId.get(item.id) || null;
    return {
      media: item,
      intelligence,
      matched: matchedTermCount({ media: item, intelligence, terms }),
      score: scoreAsset({ media: item, intelligence, terms }),
    };
  });

  // The database matches loosely so nothing is missed; a real word match is
  // required here. Without this, "car" would still return a starred photo of a
  // carpet, because the quality and favourite bonuses score above zero on their
  // own.
  const keywordHits = scored
    .filter((entry) => !terms.length || entry.matched > 0)
    .sort((a, b) => b.score - a.score);

  const semanticHits = queryVector ? await semanticRanking(db, userId, queryVector, size) : [];
  if (!semanticHits.length) {
    return keywordHits.slice(0, size).map(({ media: item, intelligence, score }) => ({
      ...compactAsset(item, intelligence),
      relevanceScore: Number(score.toFixed(2)),
      matchedBy: 'keyword',
    }));
  }

  // Weighted slightly toward keyword: an exact word match is a stronger signal
  // of intent than semantic closeness, which is what stops "beach" outranking a
  // photo literally tagged "beach".
  const fused = fuseRankings(
    [keywordHits.map((entry) => entry.media.id), semanticHits.map((entry) => entry.id)],
    { weights: [1.2, 1] },
  ).slice(0, size);

  const byId = new Map(scored.map((entry) => [entry.media.id, entry]));
  const semanticById = new Map(semanticHits.map((entry) => [entry.id, entry.score]));
  const keywordIds = new Set(keywordHits.map((entry) => entry.media.id));

  // Semantic hits the keyword pass never loaded still need their documents.
  const missingIds = fused.map((entry) => entry.id).filter((id) => !byId.has(id));
  if (missingIds.length) {
    const [extraMedia, extraIntelligence] = await Promise.all([
      db.collection('media').find({ userId, trashed: { $ne: true }, id: { $in: missingIds } }).toArray(),
      db.collection('asset_intelligence').find({
        userId,
        mediaId: { $in: missingIds },
        pipelineVersion: ASSET_INTELLIGENCE_PIPELINE_VERSION,
      }).toArray(),
    ]);
    const extraIntelligenceById = new Map(extraIntelligence.map((item) => [item.mediaId, item]));
    for (const item of extraMedia) {
      byId.set(item.id, { media: item, intelligence: extraIntelligenceById.get(item.id) || null });
    }
  }

  return fused
    .map(({ id, score }) => {
      const entry = byId.get(id);
      if (!entry) return null;
      const semantic = semanticById.get(id);
      return {
        ...compactAsset(entry.media, entry.intelligence),
        relevanceScore: Number(score.toFixed(4)),
        semanticScore: semantic === undefined ? null : Number(semantic.toFixed(3)),
        matchedBy: keywordIds.has(id) && semantic !== undefined ? 'both' : keywordIds.has(id) ? 'keyword' : 'meaning',
      };
    })
    .filter(Boolean);
}

export async function retrieveGroundedMemoryContext(db, userId, task) {
  const { media, intelligenceByMediaId } = await loadCandidates(db, userId, 220);
  if (!media.length) {
    return {
      totalAvailable: 0,
      indexedAvailable: 0,
      selected: [],
      promptBlock: 'Verified memory context: no saved media found for this user yet.',
    };
  }

  const terms = memorySearchTerms(task);
  const selected = media
    .map((item) => {
      const intelligence = intelligenceByMediaId.get(item.id) || null;
      return { media: item, intelligence, score: scoreAsset({ media: item, intelligence, terms }) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ media: item, intelligence }) => compactAsset(item, intelligence));

  const promptBlock = JSON.stringify({
    rule: 'Use only this verified user-owned context. Never invent people, relationships, places, dates, deadlines, tasks, events, or counts. Treat extracted tasks and actions as suggestions that require user review before execution. If evidence is insufficient, say so clearly.',
    totalAvailable: media.length,
    indexedAvailable: intelligenceByMediaId.size,
    selected,
  });

  return {
    totalAvailable: media.length,
    indexedAvailable: intelligenceByMediaId.size,
    selected,
    promptBlock,
  };
}
