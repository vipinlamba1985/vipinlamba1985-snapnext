const STOP_WORDS = new Set([
  'a','about','all','an','and','any','are','at','be','browse','can','could','did','do','for','from','get','give','good','great','has','have','i','in','is','it','just','library','look','looking','me','more','my','nice','of','on','only','or','please','saved','search','show','some','tell','the','this','to','want','was','were','what','when','where','with','would','you',
  'amazing','beautiful','best','favorite','favourite','highlight','highlights','important','loved','meaningful',
  'earliest','first','latest','newest','oldest','past','previous','recent','today','yesterday','last','week','weeks','month','months','year','years','taken','shot','during',
  'everything','memory','memories','photo','photos','picture','pictures','pic','pics','video','videos','clip','clips','find',
]);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function array(value) {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}

function textValue(value) {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value).trim();
  return [
    value.displayName, value.name, value.label, value.value, value.title,
    value.city, value.state, value.province, value.country,
  ].map((item) => String(item || '').trim()).filter(Boolean).join(', ');
}

function uniq(values) {
  return [...new Set(values.map(textValue).filter(Boolean))];
}

const IRREGULAR_TOKENS = new Map([
  ['babies', 'baby'], ['beaches', 'beach'], ['children', 'child'], ['kids', 'kid'],
  ['men', 'man'], ['people', 'person'], ['women', 'woman'],
]);

function canonicalToken(value) {
  const token = normalize(value);
  if (IRREGULAR_TOKENS.has(token)) return IRREGULAR_TOKENS.get(token);
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && /(ches|shes|sses|xes|zes)$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function tokensFor(value) {
  return normalize(textValue(value))
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map(canonicalToken)
    .filter(Boolean);
}

function fieldHasTerm(value, term) {
  const expected = canonicalToken(term);
  if (!expected) return false;
  return array(value).some((entry) => tokensFor(entry).some((token) => (
    token === expected
    || (expected.length >= 5 && token.startsWith(expected))
    || (token.length >= 5 && expected.startsWith(token))
  )));
}

export function queryTerms(query) {
  return uniq(tokensFor(query)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term) && !/^(19|20)\d{2}$/.test(term)))
    .slice(0, 16);
}

export function buildContextualSearchGroups(query, relationships = []) {
  let remaining = queryTerms(query);
  const relationshipGroups = [];
  for (const relationship of relationships) {
    const aliases = new Set([
      ...queryTerms(relationship.relationship),
      ...queryTerms(relationship.displayName),
    ]);
    if (!remaining.some((term) => aliases.has(term))) continue;
    remaining = remaining.filter((term) => !aliases.has(term));
    for (const term of queryTerms(relationship.personName || relationship.displayName)) {
      relationshipGroups.push([term]);
    }
  }
  return [...remaining.map((term) => [term]), ...relationshipGroups];
}

export function dateRangeForQuery(query, now = new Date()) {
  const q = normalize(query);
  if (/\b(today)\b/.test(q)) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    return { start, end: now, label: 'today' };
  }
  if (/\b(yesterday)\b/.test(q)) {
    const end = new Date(now); end.setHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - 86400000);
    return { start, end, label: 'yesterday' };
  }
  if (/\b(last|past|previous) week\b/.test(q)) {
    const end = new Date(now); end.setHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - (7 * 86400000));
    return { start, end: now, label: 'last week' };
  }
  if (/\b(this week)\b/.test(q)) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return { start, end: now, label: 'this week' };
  }
  if (/\b(last|past|previous) month\b/.test(q)) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end, label: start.toLocaleString('en-US', { month: 'long', year: 'numeric' }) };
  }
  if (/\b(this month)\b/.test(q)) return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: 'this month' };
  if (/\b(last|past|previous) year\b/.test(q)) {
    const year = now.getFullYear() - 1;
    return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), label: String(year) };
  }
  if (/\b(this year)\b/.test(q)) return { start: new Date(now.getFullYear(), 0, 1), end: now, label: String(now.getFullYear()) };
  const yearMatch = q.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const year = Number(yearMatch[0]);
    return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), label: String(year) };
  }
  return null;
}

export function parseMemorySearchIntent(query, now = new Date()) {
  const q = normalize(query);
  const wantsPhotos = /\b(photo|photos|picture|pictures|pic|pics)\b/.test(q);
  const wantsVideos = /\b(video|videos|clip|clips)\b/.test(q);
  const mediaKind = wantsPhotos === wantsVideos ? null : wantsPhotos ? 'photo' : 'video';
  const favoritesOnly = /\b(favorite|favourite|favorites|favourites|loved)\b/.test(q);
  const sortOrder = /\b(oldest|earliest|first)\b/.test(q)
    ? 'oldest'
    : /\b(latest|recent|newest)\b/.test(q) ? 'recent' : null;
  const qualityFirst = /\b(best|highlight|highlights|important|meaningful)\b/.test(q);
  const browseAll = /\b(all|everything|library|memories)\b/.test(q);
  const range = dateRangeForQuery(query, now);
  return {
    mediaKind,
    favoritesOnly,
    sortOrder,
    qualityFirst,
    browseAll,
    range,
    hasStructuredIntent: Boolean(mediaKind || (wantsPhotos && wantsVideos) || favoritesOnly || sortOrder || qualityFirst || browseAll || range),
  };
}

function qualityScore(media) {
  const ai = media.aiAnalysis || {};
  let score = 35;
  if (media.favorite || media.isFavorite) score += 25;
  if (ai.description) score += 8;
  if (array(ai.faces).length) score += 8;
  if (array(ai.locations).length) score += 6;
  if (array(ai.tags).length >= 3) score += 5;
  if (media.kind === 'video') score += 3;
  if (ai.qualityScore != null && Number.isFinite(Number(ai.qualityScore))) score = Math.max(score, Number(ai.qualityScore));
  if (ai.blurry === true || ai.blur === true) score -= 20;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function eventKey(index) {
  const date = new Date(index.createdAt);
  const day = Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString().slice(0, 10);
  const album = normalize(index.album || 'unclassified').replace(/\s+/g, '-');
  const location = normalize(index.locations[0] || 'unknown').replace(/\s+/g, '-');
  return `${day}:${album}:${location}`;
}

export function buildMemoryIndex(media) {
  const ai = media.aiAnalysis || {};
  const userTags = uniq(array(media.userTags));
  const people = uniq([
    ...array(media.people_tags), ...array(media.people),
    ...array(ai.faces), ...array(ai.people),
  ]);
  const locations = uniq([
    ...array(media.location), ...array(media.locations), media.country, media.countryCode,
    ...array(ai.locations),
  ]);
  const tags = uniq([
    ...userTags, ...array(ai.tags), ...array(ai.labels), ...array(ai.semanticTags),
  ]);
  const objects = uniq(array(ai.objects));
  const activities = uniq(array(ai.activities));
  const emotions = uniq(array(ai.emotions));
  const searchQueries = uniq(array(ai.searchQueries));
  const album = ai.autoAlbum || media.album || null;
  const category = media.userCategory || ai.contentType || null;
  const description = ai.description || ai.summary || null;
  const caption = ai.caption || null;
  const textInside = ai.textInside || ai.ocrText || null;
  const createdAt = media.capturedAt || media.takenAt || ai.capturedAt || media.createdAt || null;
  const searchable = [
    media.name, media.kind, album, category, description, caption, textInside,
    ...tags, ...people, ...locations, ...objects, ...activities, ...emotions, ...searchQueries,
  ].filter(Boolean).join(' ').toLowerCase();

  const index = {
    id: media.id,
    name: media.name,
    kind: media.kind,
    createdAt,
    favorite: !!(media.favorite || media.isFavorite),
    description,
    caption,
    textInside,
    tags,
    userTags,
    people,
    locations,
    objects,
    activities,
    emotions,
    searchQueries,
    album,
    category,
    qualityScore: qualityScore(media),
    searchable,
  };
  index.eventKey = eventKey(index);
  return index;
}

const SEARCH_FIELDS = [
  ['person', 'people', 16],
  ['location', 'locations', 15],
  ['tag', 'tags', 14],
  ['album/category', 'album', 13],
  ['album/category', 'category', 13],
  ['object', 'objects', 12],
  ['activity', 'activities', 12],
  ['description', 'description', 10],
  ['caption', 'caption', 10],
  ['semantic search', 'searchQueries', 10],
  ['visible text', 'textInside', 7],
  ['emotion', 'emotions', 7],
  ['file name', 'name', 5],
];

function bestTermMatch(index, term) {
  let best = null;
  for (const [label, field, weight] of SEARCH_FIELDS) {
    if (!fieldHasTerm(index[field], term)) continue;
    if (!best || weight > best.weight) best = { weight, reason: `${label}: ${term}` };
  }
  return best;
}

function normalizeTermGroups(groups, fallbackTerms) {
  const source = Array.isArray(groups) ? groups : fallbackTerms.map((term) => [term]);
  return source
    .map((group) => uniq(array(group).flatMap(tokensFor)).filter((term) => term.length > 2 && !STOP_WORDS.has(term)))
    .filter((group) => group.length);
}

function scoreIndex(index, termGroups, optionalTerms, intent) {
  if (intent.mediaKind && normalize(index.kind) !== intent.mediaKind) return { score: -1, reasons: [], matchedGroups: 0 };
  if (intent.favoritesOnly && !index.favorite) return { score: -1, reasons: [], matchedGroups: 0 };
  if (intent.range) {
    const date = new Date(index.createdAt);
    if (Number.isNaN(date.getTime()) || date < intent.range.start || date >= intent.range.end) {
      return { score: -1, reasons: [], matchedGroups: 0 };
    }
  }

  let score = 0;
  const reasons = [];
  let matchedGroups = 0;
  for (const group of termGroups) {
    let best = null;
    for (const term of group) {
      const match = bestTermMatch(index, term);
      if (match && (!best || match.weight > best.weight)) best = match;
    }
    if (!best) return { score: -1, reasons: [], matchedGroups };
    matchedGroups += 1;
    score += best.weight;
    reasons.push(best.reason);
  }

  for (const term of optionalTerms) {
    const match = bestTermMatch(index, term);
    if (!match) continue;
    score += Math.min(3, Math.round(match.weight / 4));
  }

  if (!termGroups.length && !intent.hasStructuredIntent) return { score: -1, reasons: [], matchedGroups: 0 };
  if (intent.mediaKind) reasons.push(intent.mediaKind);
  if (intent.favoritesOnly) reasons.push('favorite');
  if (intent.range) reasons.push(intent.range.label);
  if (intent.qualityFirst) reasons.push(`memory score ${index.qualityScore}`);
  if (intent.sortOrder) reasons.push(intent.sortOrder);
  return { score: Math.round(score), reasons: uniq(reasons).slice(0, 5), matchedGroups };
}

function dateValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function searchMemoryBrain(mediaItems, query, {
  limit = 12,
  intentQuery = query,
  requiredTermGroups = null,
  now = new Date(),
} = {}) {
  const intent = parseMemorySearchIntent(intentQuery, now);
  const termGroups = normalizeTermGroups(requiredTermGroups, queryTerms(intentQuery));
  const requiredTerms = new Set(termGroups.flat());
  const optionalTerms = queryTerms(query).filter((term) => !requiredTerms.has(term));
  const ranked = mediaItems
    .map(buildMemoryIndex)
    .map((index) => ({ index, ...scoreIndex(index, termGroups, optionalTerms, intent) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => {
      if (intent.sortOrder === 'recent') return dateValue(b.index.createdAt) - dateValue(a.index.createdAt) || b.score - a.score;
      if (intent.sortOrder === 'oldest') return dateValue(a.index.createdAt) - dateValue(b.index.createdAt) || b.score - a.score;
      if (intent.qualityFirst) return b.index.qualityScore - a.index.qualityScore || b.score - a.score;
      return b.score - a.score || b.index.qualityScore - a.index.qualityScore || dateValue(b.index.createdAt) - dateValue(a.index.createdAt);
    })
    .slice(0, limit)
    .map(({ index, score, reasons, matchedGroups }, position) => ({
      ...index,
      rank: position + 1,
      relevanceScore: score,
      confidence: termGroups.length
        ? Math.max(70, Math.min(99, 70 + score))
        : 70,
      matchedTerms: matchedGroups,
      reasons,
    }));
  return {
    matches: ranked,
    range: intent.range,
    terms: [...requiredTerms],
    intent: {
      mediaKind: intent.mediaKind,
      favoritesOnly: intent.favoritesOnly,
      sortOrder: intent.sortOrder,
      qualityFirst: intent.qualityFirst,
    },
  };
}

export function buildEventGroups(mediaItems, { minimumItems = 2, limit = 20 } = {}) {
  const groups = new Map();
  for (const media of mediaItems) {
    const item = buildMemoryIndex(media);
    if (!groups.has(item.eventKey)) groups.set(item.eventKey, []);
    groups.get(item.eventKey).push(item);
  }
  return [...groups.entries()]
    .map(([key, items]) => {
      const sorted = items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const people = uniq(sorted.flatMap((item) => item.people));
      const locations = uniq(sorted.flatMap((item) => item.locations));
      const tags = uniq(sorted.flatMap((item) => item.tags));
      const title = sorted.find((item) => item.album)?.album || locations[0] || tags[0] || 'Memory event';
      return {
        id: key,
        title,
        startAt: sorted[0]?.createdAt || null,
        endAt: sorted[sorted.length - 1]?.createdAt || null,
        count: sorted.length,
        photos: sorted.filter((item) => item.kind === 'photo').length,
        videos: sorted.filter((item) => item.kind === 'video').length,
        people: people.slice(0, 12),
        locations: locations.slice(0, 8),
        tags: tags.slice(0, 12),
        averageMemoryScore: Math.round(sorted.reduce((sum, item) => sum + item.qualityScore, 0) / sorted.length),
        memoryIds: sorted.map((item) => item.id),
      };
    })
    .filter((event) => event.count >= minimumItems)
    .sort((a, b) => new Date(b.startAt) - new Date(a.startAt))
    .slice(0, limit);
}

export function buildRelationshipGraph(mediaItems) {
  const people = new Map();
  const edges = new Map();
  for (const media of mediaItems) {
    const item = buildMemoryIndex(media);
    for (const person of item.people) people.set(person, (people.get(person) || 0) + 1);
    for (let i = 0; i < item.people.length; i += 1) {
      for (let j = i + 1; j < item.people.length; j += 1) {
        const pair = [item.people[i], item.people[j]].sort();
        const key = pair.join('::');
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
  }
  return {
    people: [...people.entries()].map(([name, appearances]) => ({ name, appearances })).sort((a, b) => b.appearances - a.appearances).slice(0, 50),
    connections: [...edges.entries()].map(([key, sharedMemories]) => {
      const [from, to] = key.split('::');
      return { from, to, sharedMemories };
    }).sort((a, b) => b.sharedMemories - a.sharedMemories).slice(0, 100),
  };
}

export function memoryBrainOverview(mediaItems) {
  const indexed = mediaItems.map(buildMemoryIndex);
  const graph = buildRelationshipGraph(mediaItems);
  const events = buildEventGroups(mediaItems);
  return {
    totals: {
      memories: indexed.length,
      photos: indexed.filter((item) => item.kind === 'photo').length,
      videos: indexed.filter((item) => item.kind === 'video').length,
      analyzed: indexed.filter((item) => item.description || item.tags.length || item.people.length || item.locations.length).length,
      favorites: indexed.filter((item) => item.favorite).length,
      people: graph.people.length,
      events: events.length,
    },
    events,
    relationships: graph,
    topMemories: [...indexed].sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 12),
  };
}
