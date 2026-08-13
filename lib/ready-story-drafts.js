import { groupIntoTrips } from './trip-sharing.js';

export const READY_STORY_GENERATOR = 'ready-story-v2';
export const READY_STORY_LIMIT = 8;
export const READY_STORY_MEDIA_LIMIT = 1200;

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_STORY_PHOTOS = 3;
const MAX_STORY_PHOTOS = 16;
const MAX_REEL_PHOTOS = 8;
const MAX_COLLAGE_PHOTOS = 6;

const SEMANTIC_TERMS = {
  wedding: ['wedding', 'bride', 'groom', 'marriage', 'reception', 'ceremony', 'shaadi'],
  birthday: ['birthday', 'bday', 'birthday cake', 'happy birthday'],
  celebration: ['celebration', 'party', 'anniversary', 'reunion', 'festival'],
  travel: ['trip', 'travel', 'vacation', 'holiday', 'airport', 'flight', 'hotel', 'tour', 'sightseeing', 'road trip'],
};

function dateOf(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function captureDate(item) {
  return dateOf(item?.capturedAt || item?.takenAt || item?.mediaCreatedAt || item?.createdAt || item?.uploadedAt);
}

function photoItems(items = []) {
  return (Array.isArray(items) ? items : []).filter(item => item?.id && item?.kind === 'photo' && !item?.trashed);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(value => String(value)))];
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'story';
}

function titleCase(value) {
  return String(value || '').replace(/\b\w/g, character => character.toUpperCase());
}

function collectStrings(value, output = []) {
  if (!value) return output;
  if (Array.isArray(value)) {
    value.forEach(entry => collectStrings(entry, output));
    return output;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach(entry => collectStrings(entry, output));
    return output;
  }
  if (typeof value === 'string') output.push(value.trim());
  return output;
}

function semanticText(item) {
  const values = [];
  collectStrings(item?.name, values);
  collectStrings(item?.userCategory, values);
  collectStrings(item?.userTags, values);
  collectStrings(item?.aiAnalysis?.caption, values);
  collectStrings(item?.aiAnalysis?.description, values);
  collectStrings(item?.aiAnalysis?.tags, values);
  collectStrings(item?.aiAnalysis?.autoAlbum, values);
  collectStrings(item?.aiAnalysis?.contentType, values);
  return values.filter(Boolean).join(' ').toLowerCase();
}

function labelsForMedia(item) {
  const values = [];
  const push = value => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(push);
    if (typeof value === 'object') {
      push(value.name);
      push(value.displayName);
      push(value.label);
      return;
    }
    values.push(String(value).trim().toLowerCase());
  };
  push(item?.people);
  push(item?.people_tags);
  push(item?.userConfirmedPeople);
  push(item?.aiAnalysis?.faces);
  push(item?.aiAnalysis?.people);
  push(item?.peopleIntelligence?.people);
  return unique(values);
}

function exactMediaKey(item) {
  return String(item?.hash || item?.sha256 || item?.contentHash || item?.id || '');
}

function mediaQualityScore(item) {
  const text = semanticText(item);
  const peopleCount = labelsForMedia(item).length;
  let score = 0;
  if (item?.favorite) score += 28;
  if (peopleCount >= 1 && peopleCount <= 5) score += 14;
  else if (peopleCount > 5) score += 7;
  if (String(item?.aiAnalysis?.caption || '').trim()) score += 8;
  if (Array.isArray(item?.aiAnalysis?.tags) && item.aiAnalysis.tags.length) score += 5;
  if (Array.isArray(item?.aiAnalysis?.locations) && item.aiAnalysis.locations.length) score += 3;
  const width = Number(item?.width || item?.dimensions?.width || 0);
  const height = Number(item?.height || item?.dimensions?.height || 0);
  if (width >= 1200 && height >= 1200) score += 4;
  if (/screenshot|document|receipt|invoice|passport|text document/.test(text)) score -= 24;
  return score;
}

function deDuplicateExactPhotos(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of photoItems(items)) {
    const key = exactMediaKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function selectStoryPhotos(items = [], max = MAX_STORY_PHOTOS) {
  const photos = deDuplicateExactPhotos(items);
  if (photos.length <= max) return photos.slice().sort((a, b) => (captureDate(a)?.getTime() || 0) - (captureDate(b)?.getTime() || 0));

  const chronological = photos.slice().sort((a, b) => (captureDate(a)?.getTime() || 0) - (captureDate(b)?.getTime() || 0));
  const chosen = [];
  for (let index = 0; index < max; index += 1) {
    const start = Math.floor(index * chronological.length / max);
    const end = Math.max(start + 1, Math.floor((index + 1) * chronological.length / max));
    const bucket = chronological.slice(start, end).sort((a, b) => mediaQualityScore(b) - mediaQualityScore(a));
    if (bucket[0]) chosen.push(bucket[0]);
  }
  return deDuplicateExactPhotos(chosen).sort((a, b) => (captureDate(a)?.getTime() || 0) - (captureDate(b)?.getTime() || 0));
}

function visualSelections(items = [], id = '') {
  const selected = selectStoryPhotos(items, MAX_STORY_PHOTOS);
  const byQuality = selected.slice().sort((a, b) => mediaQualityScore(b) - mediaQualityScore(a));
  const hero = byQuality[0];
  const reel = hero ? [hero, ...selected.filter(item => item.id !== hero.id)].slice(0, MAX_REEL_PHOTOS) : selected.slice(0, MAX_REEL_PHOTOS);
  const layouts = ['editorial', 'cinema', 'magazine'];
  const seed = [...String(id || '')].reduce((total, character) => total + character.charCodeAt(0), 0);
  return {
    selected,
    collage: byQuality.slice(0, MAX_COLLAGE_PHOTOS),
    reel,
    collageLayout: layouts[seed % layouts.length],
  };
}

function frameCaption(item) {
  const caption = String(item?.aiAnalysis?.caption || item?.aiAnalysis?.description || '').replace(/\s+/g, ' ').trim();
  if (caption) return caption.slice(0, 120);
  const captured = captureDate(item);
  return captured ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(captured) : '';
}

function calendarDistanceDays(date, month, day) {
  if (!date) return Infinity;
  const year = date.getUTCFullYear();
  const target = new Date(Date.UTC(year, month, day));
  return Math.abs(Math.round((Date.UTC(year, date.getUTCMonth(), date.getUTCDate()) - target.getTime()) / DAY_MS));
}

function annualOccurrence(date, now) {
  const source = dateOf(date);
  if (!source) return null;
  const current = dateOf(now) || new Date();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const year = current.getUTCFullYear();
  const thisYear = new Date(Date.UTC(year, month, day));
  const today = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()));
  const delta = Math.round((thisYear.getTime() - today.getTime()) / DAY_MS);
  if (delta >= 0) return { date: thisYear, daysUntil: delta, daysSince: null };
  const next = new Date(Date.UTC(year + 1, month, day));
  const nextDelta = Math.round((next.getTime() - today.getTime()) / DAY_MS);
  return { date: next, daysUntil: nextDelta, daysSince: Math.abs(delta) };
}

export function describeAnnualEventTiming(date, now = new Date()) {
  const occurrence = annualOccurrence(date, now);
  if (!occurrence) return null;
  if (occurrence.daysSince !== null && occurrence.daysSince <= 14) {
    if (occurrence.daysSince === 0) return { relevant: true, label: 'Today', score: 34 };
    if (occurrence.daysSince === 1) return { relevant: true, label: 'Yesterday', score: 32 };
    return { relevant: true, label: `${occurrence.daysSince} days ago`, score: Math.max(20, 33 - occurrence.daysSince) };
  }
  if (occurrence.daysUntil <= 21) {
    if (occurrence.daysUntil === 0) return { relevant: true, label: 'Today', score: 36 };
    if (occurrence.daysUntil === 1) return { relevant: true, label: 'Tomorrow', score: 35 };
    return { relevant: true, label: `In ${occurrence.daysUntil} days`, score: Math.max(18, 35 - occurrence.daysUntil) };
  }
  return { relevant: false, label: '', score: 0 };
}

function sourcePhotos(mediaById, ids) {
  return unique(ids).map(id => mediaById.get(id)).filter(item => item?.kind === 'photo' && !item?.trashed);
}

function celebrationPhotos({ photos, profile, event, mediaById }) {
  const trusted = sourcePhotos(mediaById, event?.sourceMediaIds || event?.memoryIds || []);
  if (trusted.length >= MIN_STORY_PHOTOS) return trusted;
  const eventDate = dateOf(event?.date || profile?.birthday || profile?.anniversary);
  const personName = String(profile?.name || '').trim().toLowerCase();
  if (!eventDate || !personName) return trusted;
  const matched = photos.filter(item => {
    const captured = captureDate(item);
    if (!captured || captured.getUTCFullYear() === (dateOf(new Date())?.getUTCFullYear())) return false;
    const names = labelsForMedia(item);
    return names.includes(personName) && calendarDistanceDays(captured, eventDate.getUTCMonth(), eventDate.getUTCDate()) <= 5;
  });
  return unique([...trusted.map(item => item.id), ...matched.map(item => item.id)])
    .map(id => mediaById.get(id))
    .filter(Boolean);
}

function candidate({ id, type, title, kicker, caption, photos, score, happenedAt = null, source = null }) {
  const rawPhotos = deDuplicateExactPhotos(photos);
  const visual = visualSelections(rawPhotos, `${type}:${id}`);
  const mediaIds = visual.selected.map(item => item.id);
  if (mediaIds.length < MIN_STORY_PHOTOS) return null;
  return {
    id: `ready-${slug(type)}-${slug(id)}`,
    type,
    title: String(title || 'A story from your memories').slice(0, 160),
    kicker: String(kicker || 'Ready to review').slice(0, 100),
    caption: String(caption || '').slice(0, 1200),
    mediaIds,
    collageMediaIds: visual.collage.map(item => item.id),
    reelMediaIds: visual.reel.map(item => item.id),
    reelFrames: visual.reel.map(item => ({ mediaId: item.id, caption: frameCaption(item) })),
    collageLayout: visual.collageLayout,
    sourceCount: rawPhotos.length,
    selectedCount: mediaIds.length,
    score: Number(score || 0),
    happenedAt: dateOf(happenedAt)?.toISOString() || null,
    source,
    generator: READY_STORY_GENERATOR,
    intelligence: 'existing-library-signals',
    approvalRequired: true,
    autoPost: false,
    status: 'ready',
  };
}

function overlapRatio(a = [], b = []) {
  const left = new Set(a);
  const right = new Set(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const id of left) if (right.has(id)) overlap += 1;
  return overlap / Math.min(left.size, right.size);
}

function deDuplicate(candidates, limit) {
  const ranked = candidates.filter(Boolean).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.happenedAt || 0) - new Date(a.happenedAt || 0);
  });
  const kept = [];
  for (const item of ranked) {
    if (kept.some(existing => overlapRatio(existing.mediaIds, item.mediaIds) >= 0.75)) continue;
    kept.push(item);
    if (kept.length >= limit) break;
  }
  return kept;
}

function savedStoryCandidates({ stories, mediaById }) {
  return (Array.isArray(stories) ? stories : []).map(story => {
    const photos = sourcePhotos(mediaById, story?.sourceIds || story?.memoryIds || []);
    const body = String(story?.body || '').replace(/\s+/g, ' ').trim();
    return candidate({
      id: story?.id || story?.eventId || story?.title,
      type: 'saved-story',
      title: story?.title || story?.eventTitle || 'Your saved story',
      kicker: 'Grounded story draft',
      caption: body ? body.slice(0, 420) : `${photos.length} confirmed moments are ready to review together.`,
      photos,
      score: 150,
      happenedAt: story?.updatedAt || story?.createdAt,
      source: { kind: 'memory-story', id: story?.id || null },
    });
  });
}

function confirmedEventCandidates({ memoryEvents, mediaById }) {
  return (Array.isArray(memoryEvents) ? memoryEvents : []).map(event => {
    const photos = sourcePhotos(mediaById, event?.memoryIds || []);
    return candidate({
      id: event?.id || event?.title,
      type: 'confirmed-event',
      title: event?.title || 'A confirmed memory story',
      kicker: 'Confirmed memories',
      caption: `${photos.length} saved moments from this confirmed event are already arranged as a private story set. Review the motion story, collage, caption, and sharing options when you are ready.`,
      photos,
      score: 132,
      happenedAt: event?.date || event?.updatedAt || event?.createdAt,
      source: { kind: 'memory-event', id: event?.id || null },
    });
  });
}

function celebrationCandidates({ photos, profiles, lifeEvents, mediaById, now }) {
  const profileById = new Map((Array.isArray(profiles) ? profiles : []).map(profile => [String(profile?.id || ''), profile]));
  const eventRows = [...(Array.isArray(lifeEvents) ? lifeEvents : [])];
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (profile?.birthday) eventRows.push({ id: `birthday:${profile.id}`, type: 'birthday', title: `${profile.name}'s birthday`, date: profile.birthday, personId: profile.id, annual: true });
    if (profile?.anniversary) eventRows.push({ id: `anniversary:${profile.id}`, type: 'anniversary', title: `${profile.name}'s anniversary`, date: profile.anniversary, personId: profile.id, annual: true });
  }

  const seen = new Set();
  return eventRows.map(event => {
    const key = `${event?.type}:${event?.personId || event?.title || event?.id}`;
    if (seen.has(key)) return null;
    seen.add(key);
    if (!['birthday', 'anniversary', 'celebration'].includes(String(event?.type || '').toLowerCase())) return null;
    const timing = describeAnnualEventTiming(event?.date, now);
    if (!timing?.relevant) return null;
    const profile = profileById.get(String(event?.personId || '')) || null;
    const matched = celebrationPhotos({ photos, profile, event, mediaById });
    const title = event?.title || (profile?.name ? `${profile.name}'s celebration` : 'Celebration memories');
    return candidate({
      id: event?.id || key,
      type: String(event?.type || 'celebration').toLowerCase(),
      title: `${title} memories`,
      kicker: timing.label,
      caption: `${matched.length} saved moments connected to ${title} are ready as a private motion story and collage. SnapNext uses existing people, date, and memory signals to select the strongest frames for review.`,
      photos: matched,
      score: 170 + timing.score,
      happenedAt: event?.date,
      source: { kind: 'life-event', id: event?.id || null },
    });
  });
}

function onThisDayCandidate({ photos, now }) {
  const current = dateOf(now) || new Date();
  const matches = photos.filter(item => {
    const captured = captureDate(item);
    return captured
      && captured.getUTCFullYear() < current.getUTCFullYear()
      && captured.getUTCMonth() === current.getUTCMonth()
      && captured.getUTCDate() === current.getUTCDate();
  });
  if (matches.length < MIN_STORY_PHOTOS) return null;
  const years = unique(matches.map(item => captureDate(item)?.getUTCFullYear())).sort();
  return candidate({
    id: `${current.getUTCMonth() + 1}-${current.getUTCDate()}`,
    type: 'on-this-day',
    title: 'This day, years ago',
    kicker: years.length === 1 ? `${current.getUTCFullYear() - Number(years[0])} years ago` : `${years.length} years of memories`,
    caption: `${matches.length} moments from this calendar day are connected into one private story. SnapNext spreads the selection across the years instead of simply taking the first four photos.`,
    photos: matches,
    score: 144,
    happenedAt: matches.map(captureDate).filter(Boolean).sort((a, b) => b - a)[0],
    source: { kind: 'on-this-day' },
  });
}

function signalCount(items, terms) {
  return items.reduce((count, item) => {
    const text = semanticText(item);
    return count + (terms.some(term => text.includes(term)) ? 1 : 0);
  }, 0);
}

function clusterStoryKind(trip) {
  const items = trip?.items || [];
  const wedding = signalCount(items, SEMANTIC_TERMS.wedding);
  const birthday = signalCount(items, SEMANTIC_TERMS.birthday);
  const celebration = signalCount(items, SEMANTIC_TERMS.celebration);
  const travel = signalCount(items, SEMANTIC_TERMS.travel);
  const durationHours = Math.max(0, (new Date(trip.endAt).getTime() - new Date(trip.startAt).getTime()) / (60 * 60 * 1000));
  const meaningfulHits = Math.max(2, Math.ceil(items.length * 0.18));
  if (wedding >= meaningfulHits) return 'wedding';
  if (birthday >= meaningfulHits) return 'birthday-memory';
  if (celebration >= meaningfulHits) return 'celebration';
  if (travel >= meaningfulHits || (trip.place && durationHours >= 18)) return 'trip';
  return 'memory';
}

function ageLabel(ageDays) {
  if (ageDays >= 365) {
    const years = Math.floor(ageDays / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
  }
  const months = Math.floor(ageDays / 30) || 1;
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

function clusterTitle(kind, trip) {
  const place = trip.place ? titleCase(trip.place) : '';
  if (kind === 'wedding') return place ? `${place} · Wedding memories` : 'Wedding memories';
  if (kind === 'birthday-memory') return place ? `${place} · Birthday memories` : 'Birthday memories';
  if (kind === 'celebration') return place ? `${place} · Celebration memories` : 'Celebration memories';
  if (kind === 'trip') return place ? `${place} trip memories` : `Trip memories · ${trip.title}`;
  return place ? `${place} memories` : `Memories · ${trip.title}`;
}

function clusterCandidates({ photos, now }) {
  const current = dateOf(now) || new Date();
  return groupIntoTrips(photos).map(trip => {
    const ageDays = Math.max(0, Math.floor((current.getTime() - new Date(trip.endAt).getTime()) / DAY_MS));
    if (ageDays < 14) return null;
    const kind = clusterStoryKind(trip);
    const title = clusterTitle(kind, trip);
    const signalText = kind === 'trip'
      ? 'time, place, and travel signals'
      : kind === 'memory'
        ? 'time, place, people, and existing photo intelligence'
        : `time, people, and existing ${kind.replace('-memory', '')} signals`;
    return candidate({
      id: trip.id,
      type: kind,
      title,
      kicker: ageLabel(ageDays),
      caption: `${trip.count} related moments were matched using ${signalText}. SnapNext selected the strongest and most varied frames for a private motion story and richer collage, ready for you to review.`,
      photos: trip.items,
      score: (kind === 'memory' ? 112 : 126) + Math.min(20, trip.count),
      happenedAt: trip.endAt,
      source: { kind: kind === 'trip' ? 'trip' : 'memory-cluster', id: trip.id },
    });
  });
}

export function buildReadyStoryCandidates({
  media = [],
  memoryEvents = [],
  lifeEvents = [],
  profiles = [],
  stories = [],
  now = new Date(),
  limit = READY_STORY_LIMIT,
} = {}) {
  const photos = photoItems(media);
  const mediaById = new Map(photos.map(item => [String(item.id), item]));
  if (photos.length < MIN_STORY_PHOTOS) return [];

  const candidates = [
    ...celebrationCandidates({ photos, profiles, lifeEvents, mediaById, now }),
    ...savedStoryCandidates({ stories, mediaById }),
    ...confirmedEventCandidates({ memoryEvents, mediaById }),
    onThisDayCandidate({ photos, now }),
    ...clusterCandidates({ photos, now }),
  ];

  return deDuplicate(candidates, Math.max(1, Math.min(READY_STORY_LIMIT, Number(limit) || READY_STORY_LIMIT)));
}
