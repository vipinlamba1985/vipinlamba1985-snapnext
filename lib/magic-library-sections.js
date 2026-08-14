import { bestMagicItems } from '@/lib/magic-library-view';
import { mediaPersonLabels } from '@/lib/gallery-labels';
import { mediaCategory } from '@/lib/media-category';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CELEBRATION_SIGNAL = /\b(birthday|birth day|wedding|anniversary|celebration|party|cake|graduation|festival|holiday|baby shower|engagement|ceremony)\b/i;
const TRAVEL_SIGNAL = /\b(trip|travel|vacation|holiday|journey|tour|airport|flight|hotel|beach|resort|road trip|sightseeing)\b/i;

function mediaDate(item = {}) {
  return new Date(item.capturedAt || item.takenAt || item.mediaCreatedAt || item.createdAt || item.uploadedAt || 0);
}

function recent(items = []) {
  return [...items].sort((a, b) => mediaDate(b) - mediaDate(a));
}

function uniqueWithout(items, usedIds) { return items.filter((item) => !usedIds.has(item.id)); }
function remember(items, usedIds) { for (const item of items) usedIds.add(item.id); return items; }
function safePersonLabel(value) {
  const label = String(value || '').trim();
  return !label || label === 'Add name' || UUID_PATTERN.test(label) ? 'this person' : label;
}

function analysisText(item = {}) {
  const analysis = item.aiAnalysis || {};
  return [
    item.name,
    analysis.description,
    analysis.autoAlbum,
    ...(analysis.tags || []),
    ...(item.userTags || []),
  ].filter(Boolean).join(' ');
}

function hasPlace(item = {}) {
  const analysis = item.aiAnalysis || {};
  return Boolean(
    (Array.isArray(analysis.locations) && analysis.locations.some(Boolean))
      || item.location?.name
      || item.placeName
      || item.city
      || item.country,
  );
}

function bestAcrossYears(items = []) {
  const byYear = new Map();
  for (const item of items) {
    const date = mediaDate(item);
    const year = date.getUTCFullYear();
    if (!Number.isFinite(year) || year < 1990 || year > 2200) continue;
    const bucket = byYear.get(year) || [];
    bucket.push(item);
    byYear.set(year, bucket);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, yearItems]) => bestMagicItems(yearItems)[0])
    .filter(Boolean)
    .slice(0, 12);
}

export function findConfirmedSelfLabel(people = []) {
  const match = people.find((person) => Boolean(person?.isSelf))
    || people.find((person) => ['me', 'you'].includes(String(person?.displayName || person?.name || '').trim().toLowerCase()));
  return match?.name || '';
}

export function buildPersonSections({ items = [], personName = '', selfLabel = '', displayName = (value) => value }) {
  const source = recent(items);
  const videos = source.filter((item) => mediaCategory(item) === 'videos');
  const photos = source.filter((item) => mediaCategory(item) === 'photos');
  const bestPool = photos.filter((item) => item.peopleContext?.bestEligible !== false);
  const best = bestMagicItems(bestPool);
  const groupPhotos = photos.filter((item) => Boolean(item.peopleContext?.groupPhoto));
  const label = safePersonLabel(displayName(personName));
  const isSelf = Boolean(selfLabel && personName === selfLabel);
  const together = !isSelf && selfLabel
    ? bestMagicItems(bestPool.filter((item) => mediaPersonLabels(item).includes(selfLabel)))
    : [];
  const overYears = bestAcrossYears(bestPool);
  const celebrations = bestMagicItems(bestPool.filter((item) => CELEBRATION_SIGNAL.test(analysisText(item))));
  const tripsAndPlaces = bestMagicItems(bestPool.filter((item) => hasPlace(item) || TRAVEL_SIGNAL.test(analysisText(item))));

  const sections = [
    { key: 'person-best', title: isSelf ? 'Your best moments ✨' : label === 'this person' ? 'Best memories for this person ✨' : `Best of ${label} ✨`, items: best },
    { key: 'person-together', title: label === 'this person' ? 'You together' : `You + ${label}`, items: together },
    { key: 'person-years', title: isSelf ? 'You over the years' : label === 'this person' ? 'Over the years' : `${label} over the years`, items: overYears },
    { key: 'person-celebrations', title: isSelf ? 'Your celebrations' : label === 'this person' ? 'Birthdays & celebrations' : `${label} · birthdays & celebrations`, items: celebrations },
    { key: 'person-places', title: isSelf ? 'Your trips & places' : label === 'this person' ? 'Trips & places' : `${label} · trips & places`, items: tripsAndPlaces },
    { key: 'person-groups', title: label === 'this person' ? 'Group photos' : `Group photos with ${label}`, items: groupPhotos },
    { key: 'person-videos', title: `Videos with ${label}`, items: videos },
    { key: 'person-photos', title: isSelf ? 'All photos of you' : `All photos with ${label}`, items: photos },
  ];

  // Person pages should feel curated, not like a checklist of empty AI promises.
  // Keep the complete photo history visible, and only show smart sections when
  // the user's own library has evidence for them.
  return sections.filter((section) => section.key === 'person-photos' || section.items.length > 0);
}

export function buildLibrarySections({ items = [], selfLabel = '', displayName = (value) => value }) {
  const base = recent(items);
  const used = new Set();
  const photosOnly = base.filter((item) => mediaCategory(item) === 'photos');
  const selfPhotos = selfLabel ? photosOnly.filter((item) => mediaPersonLabels(item).includes(selfLabel)) : photosOnly;
  const primaryBest = remember(bestMagicItems(selfPhotos), used);
  const favoritePhotos = uniqueWithout(photosOnly.filter((item) => item.favorite || item.isFavorite), used);
  const bestFavorites = remember(bestMagicItems(favoritePhotos), used);
  const videos = remember(base.filter((item) => mediaCategory(item) === 'videos'), used);
  const screenshots = remember(base.filter((item) => mediaCategory(item) === 'screenshots'), used);
  const docs = remember(base.filter((item) => mediaCategory(item) === 'docs'), used);
  const recentOther = uniqueWithout(photosOnly, used);
  const selfName = safePersonLabel(displayName(selfLabel));

  return [
    { key: 'me', title: selfLabel && selfName !== 'this person' ? `Best of ${selfName} ✨` : 'Best Matches ✨', items: primaryBest },
    { key: 'favorites', title: 'Best of favorites ❤️', items: bestFavorites },
    { key: 'videos', title: 'Videos', items: videos },
    { key: 'recent', title: 'Photos', items: recentOther },
    { key: 'screenshots', title: 'Screenshots', items: screenshots },
    { key: 'docs', title: 'Docs', items: docs },
  ];
}
