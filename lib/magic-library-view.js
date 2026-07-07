import { mediaPersonLabels, mediaSearchText } from '@/lib/gallery-labels';

export function buildMagicPeople(items = []) {
  const map = new Map();
  for (const item of items) {
    for (const name of mediaPersonLabels(item)) {
      const row = map.get(name) || { name, count: 0, photos: 0, videos: 0, representativeMediaId: null };
      row.count += 1;
      if (item.kind === 'photo') row.photos += 1;
      if (item.kind === 'video') row.videos += 1;
      if (!row.representativeMediaId && item.kind === 'photo') row.representativeMediaId = item.id;
      if (!row.representativeMediaId) row.representativeMediaId = item.id;
      map.set(name, row);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function buildMagicSuggestions(items = []) {
  const counts = new Map();
  for (const item of items) {
    const analysis = item.aiAnalysis || {};
    const values = [...(analysis.tags || []), ...(analysis.locations || []), analysis.autoAlbum].filter(Boolean);
    for (const value of values) {
      const key = String(value).trim().toLowerCase();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label]) => label);
}

export function filterMagicItems(items = [], query = '', person = '') {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (person && !mediaPersonLabels(item).includes(person)) return false;
    return !q || mediaSearchText(item).includes(q);
  });
}

export function bestMagicItems(items = []) {
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, 12);
}

function score(item) {
  const analysis = item.aiAnalysis || {};
  return (item.favorite ? 8 : 0) + (item.kind === 'photo' ? 3 : 0) + (analysis.description ? 2 : 0) + Math.min((analysis.tags || []).length, 5);
}
