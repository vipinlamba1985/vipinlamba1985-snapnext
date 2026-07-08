import { bestMagicItems } from '@/lib/magic-library-view';
import { mediaPersonLabels } from '@/lib/gallery-labels';

function textOf(item = {}) {
  const analysis = item.aiAnalysis || {};
  return [
    item.name,
    item.kind,
    analysis.autoAlbum,
    analysis.description,
    analysis.textInside,
    ...(analysis.tags || []),
    ...(analysis.locations || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

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
  const videos = source.filter((item) => item.kind === 'video');
  const photos = source.filter((item) => item.kind === 'photo');
  const label = displayName(personName);

  return [
    { key: 'person-best', title: `Best of ${label} ✨`, items: best },
    { key: 'person-videos', title: `Videos with ${label}`, items: videos },
    { key: 'person-photos', title: `All photos with ${label}`, items: photos },
  ];
}

export function buildLibrarySections({ items = [], selfLabel = '', displayName = (value) => value }) {
  const base = recent(items);
  const used = new Set();

  const selfPhotos = selfLabel
    ? base.filter((item) => item.kind === 'photo' && mediaPersonLabels(item).includes(selfLabel))
    : base.filter((item) => item.kind === 'photo');
  const primaryBest = remember(bestMagicItems(selfPhotos), used);

  const favoritePhotos = uniqueWithout(
    base.filter((item) => item.kind === 'photo' && (item.favorite || item.isFavorite)),
    used,
  );
  const bestFavorites = remember(bestMagicItems(favoritePhotos), used);

  const videos = remember(base.filter((item) => item.kind === 'video'), used);

  const screenshots = remember(uniqueWithout(
    base.filter((item) => item.kind === 'photo' && /screenshot/.test(textOf(item))),
    used,
  ), used);

  const docs = remember(uniqueWithout(
    base.filter((item) => item.kind === 'text' || /doc|document|receipt|invoice|statement|form|pdf|scan/.test(textOf(item))),
    used,
  ), used);

  const recentOther = uniqueWithout(base.filter((item) => item.kind === 'photo'), used);

  return [
    {
      key: 'me',
      title: selfLabel ? `Best of ${displayName(selfLabel)} ✨` : 'Best Matches ✨',
      items: primaryBest,
    },
    { key: 'favorites', title: 'Best of favorites ❤️', items: bestFavorites },
    { key: 'videos', title: 'All videos', items: videos },
    { key: 'recent', title: 'All other recent memories', items: recentOther },
    { key: 'screenshots', title: 'Screenshots', items: screenshots },
    { key: 'docs', title: 'Docs', items: docs },
  ];
}
