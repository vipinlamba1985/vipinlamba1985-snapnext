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
// Video posters use the same hot derivative prefix, but they are never decoded
// from the original on the server. The user's device extracts one small frame
// from the already-selected local video and uploads only that JPEG derivative.
// Existing or cloud-imported videos without a poster keep the lightweight
// fallback tile instead of making the grid touch the original video.
//
// No imports, so keys and sizes can be reasoned about without an S3 client.

/** Prefix for generated derivatives. Kept separate so lifecycle rules can tell them apart. */
export const THUMBNAIL_PREFIX = 'thumbs';

/** Prefix under which originals are stored. Must match lib/storage.js. */
export const ORIGINALS_PREFIX = 'users';

/** Bumping this invalidates every cached photo derivative without deleting anything. */
export const THUMBNAIL_VERSION = 'v1';

/** Bumping this invalidates stored video posters without changing originals. */
export const VIDEO_POSTER_VERSION = 'v1';

/**
 * Allowed widths. A closed set matters: an open one lets a caller mint
 * unlimited distinct objects, each costing a generation and a stored file.
 */
export const THUMBNAIL_SIZES = Object.freeze([240, 480, 960]);

export const DEFAULT_THUMBNAIL_SIZE = 480;
export const VIDEO_POSTER_SIZE = 480;
export const VIDEO_POSTER_MAX_BYTES = 768 * 1024;

/** Quality chosen so a tile is a few KB rather than a few MB. */
export const THUMBNAIL_QUALITY = 72;

/** Snaps a requested width to the nearest allowed size at or above it. */
export function normalizeThumbnailSize(requested) {
  const value = Number(requested);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_THUMBNAIL_SIZE;
  return THUMBNAIL_SIZES.find((size) => size >= value) || THUMBNAIL_SIZES[THUMBNAIL_SIZES.length - 1];
}

function safeDerivativeSegment(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
}

function derivativeOwnerAndMedia({ userId, mediaId }) {
  const owner = safeDerivativeSegment(userId);
  const media = safeDerivativeSegment(mediaId);
  if (!owner || !media) throw new Error('A derivative key needs both a user and a media id.');
  return { owner, media };
}

/**
 * Where a photo derivative lives.
 *
 * Deliberately derived from the owner and media id rather than from the
 * original's key: the derivative must sit under its own prefix so a lifecycle
 * rule can keep it in hot storage while the original cools down. Building it
 * from the original's path would put them in the same place.
 */
export function thumbnailKey({ userId, mediaId, size = DEFAULT_THUMBNAIL_SIZE }) {
  const { owner, media } = derivativeOwnerAndMedia({ userId, mediaId });
  return `${THUMBNAIL_PREFIX}/${owner}/${media}/${THUMBNAIL_VERSION}-${normalizeThumbnailSize(size)}.jpg`;
}

/** One bounded poster per video version, so callers cannot mint arbitrary objects. */
export function videoPosterKey({ userId, mediaId }) {
  const { owner, media } = derivativeOwnerAndMedia({ userId, mediaId });
  return `${THUMBNAIL_PREFIX}/${owner}/${media}/poster-${VIDEO_POSTER_VERSION}-${VIDEO_POSTER_SIZE}.jpg`;
}

/** True when a stored key is a generated derivative rather than someone's original. */
export function isThumbnailKey(key) {
  return String(key || '').startsWith(`${THUMBNAIL_PREFIX}/`);
}

/**
 * Whether a media document can have a photo thumbnail generated for it.
 * Videos and documents are excluded: decoding a video frame is a different,
 * more expensive operation and is intentionally kept off this server path.
 */
export function canGenerateThumbnail(doc = {}) {
  if (doc.kind !== 'photo') return false;
  const mime = String(doc.mime || '').toLowerCase();
  if (mime && !mime.startsWith('image/')) return false;
  return Boolean(doc.storageKey);
}

/** A device-supplied poster is accepted only for an already-stored video. */
export function canStoreVideoPoster(doc = {}) {
  if (doc.kind !== 'video') return false;
  const mime = String(doc.mime || '').toLowerCase();
  if (mime && !mime.startsWith('video/')) return false;
  return Boolean(doc.storageKey);
}

/** Fit source dimensions inside the one allowed poster edge without enlargement. */
export function fitVideoPosterDimensions(width, height, maxEdge = VIDEO_POSTER_SIZE) {
  const sourceWidth = Number(width);
  const sourceHeight = Number(height);
  const edge = Math.max(1, Number(maxEdge) || VIDEO_POSTER_SIZE);
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: edge, height: edge };
  }
  const scale = Math.min(1, edge / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
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
