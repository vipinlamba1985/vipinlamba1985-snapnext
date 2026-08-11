export const FAVORITE_PEOPLE_RECOGNITION_VERSION = 1;

export const FAVORITE_PEOPLE_LIMITS = Object.freeze({
  free: 0,
  starter: 2,
  plus: 3,
  pro: 3,
  family: 3,
  super_user: 3,
});

const INVALID_LABELS = new Set(['', 'add name', 'person', 'people', 'unknown', 'face', 'user']);

export function favoritePeopleLimitForPlan(planId) {
  return FAVORITE_PEOPLE_LIMITS[planId] ?? FAVORITE_PEOPLE_LIMITS.free;
}

export function normalizeFavoritePeople(values = []) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)));
}

export function isUsableFavoriteLabel(value) {
  const label = String(value || '').trim();
  return Boolean(label && label.length <= 80 && !INVALID_LABELS.has(label.toLowerCase()));
}

function stableHash(input) {
  const parts = [2166136261, 2246822519, 3266489917, 668265263];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    for (let j = 0; j < parts.length; j += 1) {
      parts[j] ^= code + j * 37;
      parts[j] = Math.imul(parts[j], 16777619 + j * 2) >>> 0;
    }
  }
  return parts.map((value) => value.toString(16).padStart(8, '0')).join('');
}

export function favoritePeopleCollectionId(userId) {
  return `snapnext_favorite_people_v${FAVORITE_PEOPLE_RECOGNITION_VERSION}_${stableHash(String(userId || ''))}`;
}

export function favoriteGeneration(row = {}) {
  const value = Number(row.recognitionFavoritesGeneration || 0);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
