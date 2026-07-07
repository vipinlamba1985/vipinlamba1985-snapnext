import { ASSET_INTELLIGENCE_PIPELINE_VERSION } from '@/lib/asset-intelligence';

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

function scoreAsset({ media, intelligence, terms }) {
  const text = `${legacyText(media)} ${intelligenceText(intelligence)}`;
  let score = 0;
  for (const term of terms) {
    if (text.includes(term)) score += 10;
    if (String(media.name || '').toLowerCase().includes(term)) score += 3;
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

export async function searchAssetIntelligence({ db, userId, query, limit = 20 }) {
  const terms = memorySearchTerms(query);
  const { media, intelligenceByMediaId } = await loadCandidates(db, userId);
  const ranked = media
    .map((item) => {
      const intelligence = intelligenceByMediaId.get(item.id) || null;
      return { media: item, intelligence, score: scoreAsset({ media: item, intelligence, terms }) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 20)));

  return ranked.map(({ media: item, intelligence, score }) => ({
    ...compactAsset(item, intelligence),
    relevanceScore: Number(score.toFixed(2)),
  }));
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
