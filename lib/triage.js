// Library triage — finding reclaimable space in a large library.
//
// Everything here is derived from metadata that already arrived with the
// upload: content hash, byte size, filename, capture date, starred flag. No
// model is called, no image is read, and nothing in this module may import an
// AI provider. Triage on a 10,000-item library therefore costs nothing beyond
// the database read that produced `items`.
//
// Nothing here deletes anything. These functions only propose; the caller
// decides, and the UI moves items to Trash (reversible) rather than erasing.

// Filename-only screenshot detection. lib/media-category.js has a richer
// version, but it consults aiAnalysis, which would make triage depend on
// enrichment having run — and on AI spend. These patterns are deliberately
// duplicated so the zero-cost guarantee holds for every item.
const SCREENSHOT_FILENAME = /(^|[\s_.-])(screenshot|screen[\s_-]?shot|screen[\s_-]?recording|capture|snip)([\s_.-]|$)/i;

const DAY_MS = 24 * 60 * 60 * 1000;

export const LARGE_VIDEO_MIN_BYTES = 100 * 1024 * 1024;
export const SCREENSHOT_MIN_AGE_DAYS = 90;
export const UNTOUCHED_MIN_AGE_DAYS = 365;

function toBytes(item) {
  const size = Number(item?.size);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

export function sumBytes(items = []) {
  return items.reduce((total, item) => total + toBytes(item), 0);
}

function itemDate(item) {
  const raw = item?.capturedAt || item?.takenAt || item?.mediaCreatedAt || item?.createdAt || item?.uploadedAt;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function ageInDays(item, now = new Date()) {
  const date = itemDate(item);
  if (!date) return null;
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

function isStarred(item) {
  return Boolean(item?.favorite || item?.isFavorite);
}

function isLive(item) {
  return !item?.trashed;
}

export function isScreenshotByName(item = {}) {
  if (item.kind === 'video' || item.kind === 'text') return false;
  return SCREENSHOT_FILENAME.test(String(item.name || ''));
}

/**
 * Groups live media that share a content hash — byte-identical files uploaded
 * more than once. The oldest copy is the keeper; the rest are reclaimable.
 * Starred copies are preferred as the keeper so triage never proposes removing
 * the one the user marked.
 */
export function duplicateGroups(items = []) {
  const byHash = new Map();
  for (const item of items) {
    const hash = String(item?.hash || '').trim();
    if (!hash || !isLive(item)) continue;
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(item);
  }

  const groups = [];
  for (const [hash, group] of byHash) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => {
      // A starred copy always wins the keeper slot, then the oldest one.
      if (isStarred(a) !== isStarred(b)) return isStarred(a) ? -1 : 1;
      const aDate = itemDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDate = itemDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });
    const [keeper, ...redundant] = ordered;
    groups.push({ hash, keeper, redundant, reclaimableBytes: sumBytes(redundant) });
  }

  return groups.sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);
}

export function largeVideos(items = [], minBytes = LARGE_VIDEO_MIN_BYTES) {
  return items
    .filter(item => isLive(item) && item.kind === 'video' && !isStarred(item) && toBytes(item) >= minBytes)
    .sort((a, b) => toBytes(b) - toBytes(a));
}

export function oldScreenshots(items = [], now = new Date(), minAgeDays = SCREENSHOT_MIN_AGE_DAYS) {
  return items
    .filter(item => {
      if (!isLive(item) || isStarred(item) || !isScreenshotByName(item)) return false;
      const age = ageInDays(item, now);
      return age !== null && age >= minAgeDays;
    })
    .sort((a, b) => toBytes(b) - toBytes(a));
}

/**
 * Old and never starred. Deliberately NOT called "unused": SnapNext does not
 * track opens, so claiming these were never looked at would be a lie. The
 * bucket says what it actually knows.
 */
export function untouchedOldMedia(items = [], now = new Date(), minAgeDays = UNTOUCHED_MIN_AGE_DAYS) {
  return items
    .filter(item => {
      if (!isLive(item) || isStarred(item)) return false;
      const age = ageInDays(item, now);
      return age !== null && age >= minAgeDays;
    })
    .sort((a, b) => toBytes(b) - toBytes(a));
}

export function trashedMedia(items = []) {
  return items.filter(item => item?.trashed).sort((a, b) => toBytes(b) - toBytes(a));
}

/**
 * Builds the full triage plan. Buckets are ordered by how confidently space can
 * be reclaimed: exact duplicates are safe by construction, the rest are
 * judgement calls the user has to make.
 */
export function buildTriagePlan(items = [], now = new Date()) {
  const list = Array.isArray(items) ? items : [];

  const groups = duplicateGroups(list);

  // Buckets are filled in priority order and each one only takes items no
  // earlier bucket already claimed. A duplicated, oversized, year-old video
  // belongs in exactly one place, otherwise the reclaimable total would promise
  // space that gets freed only once.
  const claimed = new Set();
  const take = candidates => {
    const taken = [];
    for (const item of candidates) {
      if (claimed.has(item.id)) continue;
      claimed.add(item.id);
      taken.push(item);
    }
    return taken;
  };

  const definitions = [
    {
      id: 'duplicates',
      title: 'Exact duplicates',
      detail: 'The same file backed up more than once. One copy of each is kept.',
      safety: 'safe',
      candidates: groups.flatMap(group => group.redundant),
      groupCount: groups.length,
    },
    {
      id: 'trashed',
      title: 'Already in Trash',
      detail: 'Still taking up space until Trash is emptied.',
      safety: 'safe',
      candidates: trashedMedia(list),
    },
    {
      id: 'large-videos',
      title: 'Large videos',
      detail: 'Your biggest unstarred videos. Worth a look before anything else.',
      safety: 'review',
      candidates: largeVideos(list),
    },
    {
      id: 'screenshots',
      title: 'Old screenshots',
      detail: 'Screenshots older than three months that you have not starred.',
      safety: 'review',
      candidates: oldScreenshots(list, now),
    },
    {
      id: 'untouched',
      title: 'Old and never starred',
      detail: 'Over a year old and never starred. SnapNext does not track opens, so review these yourself.',
      safety: 'review',
      candidates: untouchedOldMedia(list, now),
    },
  ];

  const buckets = definitions.map(({ candidates, ...bucket }) => {
    const items = take(candidates);
    return { ...bucket, items, count: items.length, reclaimableBytes: sumBytes(items) };
  });

  const safeBytes = buckets.filter(b => b.safety === 'safe').reduce((total, b) => total + b.reclaimableBytes, 0);
  const reviewBytes = buckets.filter(b => b.safety === 'review').reduce((total, b) => total + b.reclaimableBytes, 0);

  return {
    buckets: buckets.filter(bucket => bucket.count > 0),
    totals: {
      scanned: list.length,
      safeBytes,
      reviewBytes,
      reclaimableBytes: safeBytes + reviewBytes,
    },
  };
}
