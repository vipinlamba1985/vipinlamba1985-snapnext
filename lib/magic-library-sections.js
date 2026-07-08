import { bestMagicItems } from '@/lib/magic-library-view';
import { mediaPersonLabels } from '@/lib/gallery-labels';
import { mediaCategory } from '@/lib/media-category';

function recent(items = []) {
  return [...items].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function uniqueWithout(items, usedIds) {
  return items.filter((item) => !usedIds.has(item.id));
}

function remember(items, usedIds) {
  for (const item of items) usedIds.add(item.id);
  return items;
}

export function findConfirmedSelfLabel(people = []) {
  const match = people.find((person) => String(person.name || '').trim().toLowerCase() === 'me');
  return match?.name || '';
}

export function buildPersonSections({ items = [], personName = '', displayName = (value) => value }) {
  const source = recent(items);
  const best = bestMagicItems(source);
  const videos = source.filter((item) => mediaCategory(item) === 'videos');
  const photos = source.filter((item) => mediaCategory(item) === 'photos');
  const label = displayName(personName);

  return [
    { key: 'person-best', title: `Best of ${label} ✨`, items: best },
    { key: 'person-videos', title: `Videos with ${label}`, items: videos },
    { key: 'person-photos', title: `Photos with ${label}`, items: photos },
  ];
}

export function buildLibrarySections({ items = [], selfLabel = '', displayName = (value) => value }) {
  const base = recent(items);
  const used = new Set();

  const photosOnly = base.filter((item) => mediaCategory(item) === 'photos');
  const selfPhotos = selfLabel
    ? photosOnly.filter((item) => mediaPersonLabels(item).includes(selfLabel))
    : photosOnly;
  const primaryBest = remember(bestMagicItems(selfPhotos), used);

  const favoritePhotos = uniqueWithout(
    photosOnly.filter((item) => item.favorite || item.isFavorite),
    used,
  );
  const bestFavorites = remember(bestMagicItems(favoritePhotos), used);

  const videos = remember(base.filter((item) => mediaCategory(item) === 'videos'), used);
  const screenshots = remember(base.filter((item) => mediaCategory(item) === 'screenshots'), used);
  const docs = remember(base.filter((item) => mediaCategory(item) === 'docs'), used);
  const recentOther = uniqueWithout(photosOnly, used);

  return [
    {
      key: 'me',
      title: selfLabel ? `Best of ${displayName(selfLabel)} ✨` : 'Best Matches ✨',
      items: primaryBest,
    },
    { key: 'favorites', title: 'Best of favorites ❤️', items: bestFavorites },
    { key: 'videos', title: 'Videos', items: videos },
    { key: 'recent', title: 'Photos', items: recentOther },
    { key: 'screenshots', title: 'Screenshots', items: screenshots },
    { key: 'docs', title: 'Docs', items: docs },
  ];
}
