import { groupIntoTrips } from './trip-sharing.js';

export const READY_STORY_GENERATOR = 'ready-story-v1';
export const READY_STORY_LIMIT = 8;
export const READY_STORY_MEDIA_LIMIT = 1200;

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_STORY_PHOTOS = 3;
const MAX_STORY_PHOTOS = 12;

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
  push(item?.userTags);
  push(item?.aiAnalysis?.faces);
  push(item?.peopleIntelligence?.people);
  return unique(values);
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
  const mediaIds = unique(photoItems(photos).map(item => item.id)).slice(0, MAX_STORY_PHOTOS);
  if (mediaIds.length < MIN_STORY_PHOTOS) return null;
  return {
    id: `ready-${slug(type)}-${slug(id)}`,
    type,
    title: String(title || 'A story from your memories').slice(0, 160),
    kicker: String(kicker || 'Ready to review').slice(0, 100),
    caption: String(caption || '').slice(0, 1200),
    mediaIds,
    collageMediaIds: mediaIds.slice(0, 4),
    sourceCount: mediaIds.length,
    score: Number(score || 0),
    happenedAt: dateOf(happenedAt)?.toISOString() || null,
    source,
    generator: READY_STORY_GENERATOR,
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
      caption: `${photos.length} saved moments from this confirmed event are already arranged as a private story set. Review the collage, caption, and sharing options when you are ready.`,
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
      caption: `${matched.length} saved moments connected to ${title} are ready as a private collage story. Review it before sharing; SnapNext will never post it automatically.`,
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
    caption: `${matches.length} moments from this calendar day are ready as one private story. It is a quick way to revisit how the day changed across the years.`,
    photos: matches,
    score: 144,
    happenedAt: matches.map(captureDate).filter(Boolean).sort((a, b) => b - a)[0],
    source: { kind: 'on-this-day' },
  });
}

function tripCandidates({ photos, now }) {
  const current = dateOf(now) || new Date();
  return groupIntoTrips(photos).map(trip => {
    const ageDays = Math.max(0, Math.floor((current.getTime() - new Date(trip.endAt).getTime()) / DAY_MS));
    if (ageDays < 14) return null;
    const place = trip.place ? titleCase(trip.place) : 'A past trip';
    return candidate({
      id: trip.id,
      type: 'trip',
      title: trip.place ? `${place} memories` : `Trip memories · ${trip.title}`,
      kicker: ageDays >= 365 ? `${Math.floor(ageDays / 365)} year${Math.floor(ageDays / 365) === 1 ? '' : 's'} ago` : `${Math.floor(ageDays / 30) || 1} month${Math.floor(ageDays / 30) === 1 ? '' : 's'} ago`,
      caption: `${trip.count} saved moments from ${trip.title} are ready as a private trip story. SnapNext selected a compact collage so you can review and share without building it from scratch.`,
      photos: trip.items,
      score: 118 + Math.min(20, trip.count),
      happenedAt: trip.endAt,
      source: { kind: 'trip', id: trip.id },
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
    ...tripCandidates({ photos, now }),
  ];

  return deDuplicate(candidates, Math.max(1, Math.min(READY_STORY_LIMIT, Number(limit) || READY_STORY_LIMIT)));
}
