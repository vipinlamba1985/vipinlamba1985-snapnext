// Thumbnail addressing and sizing — the parts that cost nothing.
//
// Why this exists: the grid used to render by streaming each *original* photo
// in full. A 4 MB holiday photo was downloaded to draw a 200px tile, and
// nothing was stored, so it happened again every hour when the browser cache
// expired.
//
// That is expensive twice over. It burns bandwidth on every scroll, and it
// means the originals are read constantly — which blocks moving them to cheap
// cold storage, because a Glacier read costs more than a month of Glacier
// storage. Caching derivatives under their own prefix fixes both: browsing
// touches only small hot objects, and originals become genuinely cold.
//
// No imports, so keys and sizes can be reasoned about without an S3 client.

/** Prefix for generated derivatives. Kept separate so lifecycle rules can tell them apart. */
export const THUMBNAIL_PREFIX = 'thumbs';

/** Prefix under which originals are stored. Must match lib/storage.js. */
export const ORIGINALS_PREFIX = 'users';

/** Bumping this invalidates every cached derivative without deleting anything. */
export const THUMBNAIL_VERSION = 'v1';

/**
 * Allowed widths. A closed set matters: an open one lets a caller mint
 * unlimited distinct objects, each costing a generation and a stored file.
 */
export const THUMBNAIL_SIZES = Object.freeze([240, 480, 960]);

export const DEFAULT_THUMBNAIL_SIZE = 480;

/** Quality chosen so a tile is a few KB rather than a few MB. */
export const THUMBNAIL_QUALITY = 72;

/** Snaps a requested width to the nearest allowed size at or above it. */
export function normalizeThumbnailSize(requested) {
  const value = Number(requested);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_THUMBNAIL_SIZE;
  return THUMBNAIL_SIZES.find((size) => size >= value) || THUMBNAIL_SIZES[THUMBNAIL_SIZES.length - 1];
}

/**
 * Where a derivative lives.
 *
 * Deliberately derived from the owner and media id rather than from the
 * original's key: the derivative must sit under its own prefix so a lifecycle
 * rule can keep it in hot storage while the original cools down. Building it
 * from the original's path would put them in the same place.
 */
export function thumbnailKey({ userId, mediaId, size = DEFAULT_THUMBNAIL_SIZE }) {
  const owner = String(userId || '').trim();
  const media = String(mediaId || '').trim();
  if (!owner || !media) throw new Error('A thumbnail key needs both a user and a media id.');
  // Dots are excluded as well as slashes: ids are uuids or hex, so a dot only
  // ever arrives from something malformed, and leaving them in preserves ".."
  // sequences in a stored key for no benefit. The extension is added below.
  const safe = (value) => value.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${THUMBNAIL_PREFIX}/${safe(owner)}/${safe(media)}/${THUMBNAIL_VERSION}-${normalizeThumbnailSize(size)}.jpg`;
}

/** True when a stored key is a generated derivative rather than someone's original. */
export function isThumbnailKey(key) {
  return String(key || '').startsWith(`${THUMBNAIL_PREFIX}/`);
}

/**
 * Whether a media document can have a thumbnail generated for it.
 * Videos and documents are excluded: decoding a video frame is a different,
 * far more expensive operation and is not what this path is for.
 */
export function canGenerateThumbnail(doc = {}) {
  if (doc.kind !== 'photo') return false;
  const mime = String(doc.mime || '').toLowerCase();
  if (mime && !mime.startsWith('image/')) return false;
  return Boolean(doc.storageKey);
}

/**
 * Rough saving from serving a derivative instead of the original.
 * Used by the docs and tests to keep the claim honest rather than asserted.
 */
export function bytesSavedPerView({ originalBytes = 0, thumbnailBytes = 0 }) {
  const original = Math.max(0, Number(originalBytes) || 0);
  const thumb = Math.max(0, Number(thumbnailBytes) || 0);
  return Math.max(0, original - thumb);
}
