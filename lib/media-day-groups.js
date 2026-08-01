// Pure date-grouping helpers for the library timeline.
//
// These are deliberately free of React and of any network/AI dependency: the
// "All" tab groups what the user already owns, using metadata that arrived with
// the upload. No model is consulted to decide which day a photo belongs to.

const UNKNOWN_KEY = 'unknown';

/**
 * Best-known capture date for a media item, preferring real capture metadata
 * over the time we happened to receive the file. Returns the epoch when nothing
 * usable is present, which sorts last and renders as "Date not available".
 */
export function photoDate(item) {
  const raw = item?.capturedAt || item?.takenAt || item?.mediaCreatedAt || item?.createdAt || item?.uploadedAt;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : new Date(0);
}

export function dayKey(date) {
  if (!date || date.getTime() === 0) return UNKNOWN_KEY;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dayTitle(date, now = new Date()) {
  if (!date || date.getTime() === 0) return 'Date not available';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return new Intl.DateTimeFormat('en', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

/**
 * Groups media into newest-first day buckets.
 * Returns [{ key, title, items }], with undated items collected last.
 */
export function groupByDay(items = [], now = new Date()) {
  const buckets = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const date = photoDate(item);
    const key = dayKey(date);
    if (!buckets.has(key)) buckets.set(key, { key, title: dayTitle(date, now), date, items: [] });
    buckets.get(key).items.push(item);
  }

  return [...buckets.values()]
    .sort((a, b) => {
      if (a.key === UNKNOWN_KEY) return 1;
      if (b.key === UNKNOWN_KEY) return -1;
      return b.date.getTime() - a.date.getTime();
    })
    .map(({ key, title, items: bucketItems }) => ({ key, title, items: bucketItems }));
}
