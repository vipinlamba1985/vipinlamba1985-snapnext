import { mediaSearchText } from '@/lib/gallery-labels';

export function buildMagicPeople() {
  // People are now built only from persisted face clusters returned by
  // /api/magic-library/people. Descriptive AI labels are search metadata,
  // never identity records.
  return [];
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
    const clusterIds = Array.isArray(item.peopleIntelligence?.clusterIds) ? item.peopleIntelligence.clusterIds : [];
    if (person && !clusterIds.includes(person)) return false;
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
