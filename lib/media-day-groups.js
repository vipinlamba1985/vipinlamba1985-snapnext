// Pure date-grouping helpers for the Library → All timeline.
//
// All is the user's backup receipt: a memory added today must be visible today,
// even when the photo itself was captured years ago. Magic and other memory
// views can still use capture metadata for chronological storytelling.

const UNKNOWN_KEY = 'unknown';

/**
 * Best-known capture date for a media item. This remains available to features
 * that intentionally build a life timeline from when a memory happened.
 */
export function photoDate(item) {
  const raw = item?.capturedAt || item?.takenAt || item?.mediaCreatedAt || item?.createdAt || item?.uploadedAt;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : new Date(0);
}

/**
 * Best-known time the item entered SnapNext. Older records may not have an
 * explicit uploadedAt field, so createdAt is the safe compatibility fallback.
 */
export function libraryDate(item) {
  const raw = item?.uploadedAt || item?.createdAt || item?.capturedAt || item?.takenAt || item?.mediaCreatedAt;
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

export function addedDayTitle(date, now = new Date()) {
  if (!date || date.getTime() === 0) return 'Backup date not available';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Added today';
  if (dayKey(date) === dayKey(yesterday)) return 'Added yesterday';
  const label = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }).format(date);
  return `Added ${label}`;
}

function groupByDate(items = [], now = new Date(), dateForItem = libraryDate, titleForDate = dayTitle) {
  const buckets = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const date = dateForItem(item);
    const key = dayKey(date);
    if (!buckets.has(key)) buckets.set(key, { key, title: titleForDate(date, now), date, items: [] });
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

/**
 * Groups Library → All by when memories were backed up, newest first.
 */
export function groupByDay(items = [], now = new Date()) {
  return groupByDate(items, now, libraryDate, addedDayTitle);
}

/**
 * Explicit capture-date grouping for chronological memory experiences.
 */
export function groupByMemoryDay(items = [], now = new Date()) {
  return groupByDate(items, now, photoDate, dayTitle);
}
