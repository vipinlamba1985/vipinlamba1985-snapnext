// What the server will accept from Google Drive.
//
// The Picker is selection UI. What it hands back — name, mimeType, sizeBytes —
// comes through the browser and is not evidence. Drive's own metadata response
// is the source of truth, and even that is only a claim about the moment it was
// read: a file can change between metadata and download, so the bytes are
// counted as they arrive too.
//
// No imports, so the policy can be reasoned about and tested without a network.

/** Google's own document types cannot be downloaded as bytes at all. */
export const WORKSPACE_MIME_PREFIX = 'application/vnd.google-apps';

/** Per-file ceiling, matching what the ordinary uploader accepts. */
export const MAX_IMPORT_BYTES = 2 * 1024 ** 3;

export const REJECTION = Object.freeze({
  UNSUPPORTED_TYPE: 'unsupported_media_type',
  NOT_DOWNLOADABLE: 'not_downloadable',
  UNKNOWN_SIZE: 'unknown_size',
  TOO_LARGE: 'too_large',
  TRASHED: 'trashed',
});

/**
 * Parses Drive's size, which arrives as a string and is absent entirely for
 * anything that is not a stored blob. Missing is not zero — it means this item
 * has no bytes to import, which is a rejection rather than a free pass.
 */
export function parseDriveSize(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const size = Number(text);
  return Number.isSafeInteger(size) && size > 0 ? size : null;
}

/** Photos and videos only — this importer exists for a photo library. */
export function isImportableMime(mime) {
  const value = String(mime || '').trim().toLowerCase();
  if (!value || value.startsWith(WORKSPACE_MIME_PREFIX)) return false;
  return value.startsWith('image/') || value.startsWith('video/');
}

/**
 * Decides whether Drive metadata may proceed to download.
 *
 * Order matters: the cheapest and most certain refusals come first, so a
 * Workspace document or a trashed file is never weighed against quota.
 */
export function inspectDriveMetadata(meta = {}) {
  if (meta.trashed) return { ok: false, reason: REJECTION.TRASHED, size: null };

  const mime = String(meta.mimeType || '');
  if (!isImportableMime(mime)) {
    return { ok: false, reason: REJECTION.UNSUPPORTED_TYPE, size: null, mime };
  }

  // Google recommends checking this before fetching content. Absent means
  // unknown, and unknown is not permission.
  if (meta.capabilities && meta.capabilities.canDownload === false) {
    return { ok: false, reason: REJECTION.NOT_DOWNLOADABLE, size: null, mime };
  }

  const size = parseDriveSize(meta.size);
  if (size === null) return { ok: false, reason: REJECTION.UNKNOWN_SIZE, size: null, mime };
  if (size > MAX_IMPORT_BYTES) return { ok: false, reason: REJECTION.TOO_LARGE, size, mime };

  return { ok: true, reason: null, size, mime, md5: meta.md5Checksum || null };
}

/** Human wording for each refusal, so the UI never has to invent one. */
export function rejectionMessage(reason) {
  return {
    [REJECTION.UNSUPPORTED_TYPE]: 'Only photos and videos can be imported.',
    [REJECTION.NOT_DOWNLOADABLE]: 'Google Drive does not allow this file to be downloaded.',
    [REJECTION.UNKNOWN_SIZE]: 'This Drive item has no file to import.',
    [REJECTION.TOO_LARGE]: 'This file is larger than the import limit.',
    [REJECTION.TRASHED]: 'This file is in the Google Drive trash.',
  }[reason] || 'This Drive item could not be imported.';
}

/**
 * Checks what actually arrived against what was promised.
 *
 * A file can change between the metadata read and the download, and a stream
 * can simply be longer than advertised, so the delivered bytes are the ones
 * that decide. Anything that fails here must not be committed to storage.
 */
export function verifyDownloadedBytes({ expectedSize, actualSize, remainingQuota = null }) {
  if (!Number.isSafeInteger(actualSize) || actualSize <= 0) {
    return { ok: false, reason: REJECTION.UNKNOWN_SIZE };
  }
  if (actualSize > MAX_IMPORT_BYTES) return { ok: false, reason: REJECTION.TOO_LARGE };
  if (Number.isSafeInteger(expectedSize) && actualSize !== expectedSize) {
    return { ok: false, reason: 'size_mismatch' };
  }
  if (remainingQuota !== null && actualSize > remainingQuota) {
    return { ok: false, reason: 'capacity' };
  }
  return { ok: true, reason: null };
}
