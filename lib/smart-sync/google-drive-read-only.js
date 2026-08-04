// The only Drive surface the import path is allowed to touch.
//
// `drive.file` is a per-file scope, not a read-only one — it permits creating
// and modifying the files the app has access to, and Google offers no per-file
// read-only equivalent. Read-only behaviour is therefore a property of this
// code, and a promise made in code has to be enforced somewhere.
//
// `lib/smart-sync/google-drive-api.js` exports `fetchDriveJson(url, token)`,
// which will fetch whatever URL it is handed. That is fine for the sync worker,
// which builds its own queries, but it means the import path could reach a
// write endpoint through an ordinary-looking helper. This module closes that:
// two operations, both GET, both against a single validated file id. There is
// no way to express a mutation through it.
//
// A test asserts the importer imports from here and not from the general
// client.

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';

/** Fields the import path reads. Deliberately no write-adjacent fields. */
export const DRIVE_READ_FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,starred,md5Checksum,sha1Checksum,sha256Checksum,version,trashed';

/**
 * Drive file ids are opaque, but they arrive from a client, so they are
 * validated rather than trusted. Rejecting anything unexpected also stops a
 * crafted value from steering the request path elsewhere.
 */
export function assertDriveFileId(driveId) {
  const id = String(driveId || '').trim();
  if (!id || id.length > 256 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error('That Google Drive file reference is not valid.');
  }
  return id;
}

async function getJson(url, token) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Google Drive could not be read.');
    error.status = response.status;
    throw error;
  }
  return data;
}

/** Metadata for one picked file. */
export async function readDriveMetadata(token, driveId) {
  const id = assertDriveFileId(driveId);
  return getJson(`${DRIVE_FILES}/${id}?fields=${encodeURIComponent(DRIVE_READ_FIELDS)}`, token);
}

/** Content of one picked file, as a streaming response. */
export async function readDriveContent(token, driveId) {
  const id = assertDriveFileId(driveId);
  return fetch(`${DRIVE_FILES}/${id}?alt=media`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}
