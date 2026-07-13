const STOP_WORDS = new Set([
  'a','about','all','an','and','are','at','be','did','do','for','from','give','i','in','is','it','me','my','of','on','or','please','show','tell','the','this','to','was','were','what','when','where','with','you',
  'memory','memories','photo','photos','picture','pictures','pic','pics','video','videos','find','latest','recent','saved',
]);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function array(value) {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}

function uniq(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

export function queryTerms(query) {
  return normalize(query)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term))
    .slice(0, 16);
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
  const people = uniq([...array(ai.faces), ...array(ai.people)]);
  const locations = uniq(array(ai.locations));
  const tags = uniq(array(ai.tags));
  const emotions = uniq(array(ai.emotions));
  const album = ai.autoAlbum || null;
  const description = ai.description || null;
  const caption = ai.caption || null;
  const textInside = ai.textInside || ai.ocrText || null;
  const createdAt = media.createdAt || media.takenAt || null;
  const searchable = [media.name, media.kind, album, description, caption, textInside, ...tags, ...people, ...locations, ...emotions]
    .filter(Boolean).join(' ').toLowerCase();

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
    people,
    locations,
    emotions,
    album,
    qualityScore: qualityScore(media),
    searchable,
  };
  index.eventKey = eventKey(index);
  return index;
}

function scoreIndex(index, query, terms, range) {
  const q = normalize(query);
  let score = 0;
  const reasons = [];
  for (const term of terms) {
    if (index.searchable.includes(term)) { score += 8; reasons.push(`matched “${term}”`); }
    if (normalize(index.name).includes(term)) score += 3;
    if (index.people.some((value) => normalize(value).includes(term))) { score += 5; reasons.push(`person: ${term}`); }
    if (index.locations.some((value) => normalize(value).includes(term))) { score += 5; reasons.push(`location: ${term}`); }
    if (normalize(index.album).includes(term)) { score += 4; reasons.push(`event/album: ${term}`); }
  }
  if (/\b(photo|photos|picture|pictures|pic|pics)\b/.test(q) && index.kind === 'photo') { score += 3; reasons.push('photo'); }
  if (/\b(video|videos)\b/.test(q) && index.kind === 'video') { score += 3; reasons.push('video'); }
  if (/\b(favorite|favourite|loved)\b/.test(q) && index.favorite) { score += 6; reasons.push('favorite'); }
  if (/\b(best|highlight|important|meaningful)\b/.test(q)) { score += Math.round(index.qualityScore / 20); reasons.push(`memory score ${index.qualityScore}`); }
  if (/\b(latest|recent|newest)\b/.test(q) && index.createdAt) {
    const ageMonths = Math.floor((Date.now() - new Date(index.createdAt).getTime()) / (30 * 86400000));
    score += Math.max(0, 6 - ageMonths);
    reasons.push('recent');
  }
  if (range) {
    const date = new Date(index.createdAt);
    if (date >= range.start && date < range.end) { score += 6; reasons.push(range.label); }
    else return { score: -1, reasons: [] };
  }
  return { score, reasons: uniq(reasons).slice(0, 5) };
}

export function searchMemoryBrain(mediaItems, query, { limit = 12 } = {}) {
  const terms = queryTerms(query);
  const range = dateRangeForQuery(query);
  const hasStructuredIntent = /\b(latest|recent|newest|favorite|favourite|photo|photos|video|videos|today|yesterday|month|year|when|best|highlight)\b/i.test(query);
  const ranked = mediaItems
    .map(buildMemoryIndex)
    .map((index) => ({ index, ...scoreIndex(index, query, terms, range) }))
    .filter(({ score }) => score >= 0 && (score > 0 || (!terms.length && hasStructuredIntent)))
    .sort((a, b) => b.score - a.score || b.index.qualityScore - a.index.qualityScore || new Date(b.index.createdAt) - new Date(a.index.createdAt))
    .slice(0, limit)
    .map(({ index, score, reasons }, position) => ({
      ...index,
      rank: position + 1,
      relevanceScore: score,
      confidence: Math.max(40, Math.min(99, 55 + score * 3)),
      reasons,
    }));
  return { matches: ranked, range, terms };
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
