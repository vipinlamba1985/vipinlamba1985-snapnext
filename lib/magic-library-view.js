import { mediaPersonLabels, mediaSearchText } from '@/lib/gallery-labels';

function candidateNames(item = {}) {
  const a = item.aiAnalysis || {};
  const values = [
    ...(Array.isArray(item.people_tags) ? item.people_tags : []),
    ...(Array.isArray(item.people) ? item.people : []),
    ...(Array.isArray(a.people) ? a.people : []),
    ...(Array.isArray(a.faces) ? a.faces : []),
  ];
  return Array.from(new Set(values.filter((v) => typeof v === 'string').map((v) => v.trim()).filter(Boolean)));
}

function photoLooksUsable(item = {}) {
  if (item.kind !== 'photo') return false;
  const a = item.aiAnalysis || {};
  const text = [item.name, a.autoAlbum, ...(Array.isArray(a.tags) ? a.tags : [])].filter(Boolean).join(' ').toLowerCase();
  const bad = ['receipt', 'statement', 'form', 'scan', 'screenshot'];
  return !bad.some((word) => text.includes(word));
}

export function buildMagicPeople(items = []) {
  const map = new Map();
  const usedMedia = new Set();
  for (const item of items) {
    if (!photoLooksUsable(item)) continue;
    for (const name of candidateNames(item)) {
      const key = name.toLowerCase();
      const row = map.get(key) || { name, count: 0, photos: 0, videos: 0, representativeMediaId: null };
      row.count += 1;
      row.photos += 1;
      if (!row.representativeMediaId && !usedMedia.has(item.id)) {
        row.representativeMediaId = item.id;
        usedMedia.add(item.id);
      }
      map.set(key, row);
    }
  }
  return [...map.values()].filter((row) => row.representativeMediaId).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
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
    const names = [...mediaPersonLabels(item), ...candidateNames(item)];
    if (person && !names.includes(person)) return false;
    return !q || mediaSearchText(item).includes(q) || candidateNames(item).some((name) => name.toLowerCase().includes(q));
  });
}

export function bestMagicItems(items = []) {
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, 12);
}

function score(item) {
  const analysis = item.aiAnalysis || {};
  return (item.favorite ? 8 : 0) + (item.kind === 'photo' ? 3 : 0) + (analysis.description ? 2 : 0) + Math.min((analysis.tags || []).length, 5);
}
