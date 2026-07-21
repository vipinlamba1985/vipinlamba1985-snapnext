import { decryptCloudToken, encryptCloudToken } from '@/lib/cloud-token-crypto';

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_CHANGES = 'https://www.googleapis.com/drive/v3/changes';
const DRIVE_START_TOKEN = 'https://www.googleapis.com/drive/v3/changes/startPageToken';
export const DRIVE_FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,md5Checksum,sha1Checksum,sha256Checksum,version,trashed';
const MAX_DISCOVERY_ITEMS = 500;

export async function freshGoogleDriveAccessToken(db, connection) {
  if (connection.accessToken && connection.expiresAt && new Date(connection.expiresAt).getTime() > Date.now() + 60_000) {
    return decryptCloudToken(connection.accessToken);
  }
  if (!connection.refreshToken) throw new Error('Reconnect Google Drive.');
  const response = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || '',
      refresh_token: decryptCloudToken(connection.refreshToken),
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Reconnect Google Drive.');
  await db.collection('cloud_connections').updateOne(
    { _id: connection._id },
    {
      $set: {
        accessToken: encryptCloudToken(data.access_token),
        expiresAt: new Date(Date.now() + Number(data.expires_in || 3600) * 1000),
        updatedAt: new Date(),
      },
    },
  );
  return data.access_token;
}

export async function fetchDriveJson(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Google Drive could not be checked.');
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function getDriveStartPageToken(token) {
  const params = new URLSearchParams({ spaces: 'drive', supportsAllDrives: 'true' });
  const data = await fetchDriveJson(`${DRIVE_START_TOKEN}?${params}`, token);
  if (!data.startPageToken) throw new Error('Google Drive change cursor is unavailable.');
  return data.startPageToken;
}

export async function listDriveInitialPage(token, { pageToken = '', rules = [], rank = () => 0 } = {}) {
  const params = new URLSearchParams({
    q: "trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')",
    fields: `nextPageToken,files(${DRIVE_FIELDS})`,
    pageSize: String(MAX_DISCOVERY_ITEMS),
    orderBy: 'modifiedTime desc',
    spaces: 'drive',
  });
  if (pageToken) params.set('pageToken', pageToken);
  const data = await fetchDriveJson(`${DRIVE_FILES}?${params}`, token);
  const items = (data.files || [])
    .filter(item => item.id)
    .sort((a, b) => rank(a, rules) - rank(b, rules) || new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0));
  return { items, nextPageToken: data.nextPageToken || null };
}

export async function listDriveChangePage(token, pageToken) {
  const params = new URLSearchParams({
    pageToken,
    fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${DRIVE_FIELDS}))`,
    pageSize: String(MAX_DISCOVERY_ITEMS),
    spaces: 'drive',
    includeRemoved: 'true',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  });
  const data = await fetchDriveJson(`${DRIVE_CHANGES}?${params}`, token);
  return {
    changes: data.changes || [],
    nextPageToken: data.nextPageToken || null,
    newStartPageToken: data.newStartPageToken || null,
  };
}

export async function fetchDriveMetadata(token, driveId) {
  return fetchDriveJson(`${DRIVE_FILES}/${encodeURIComponent(driveId)}?fields=${encodeURIComponent(DRIVE_FIELDS)}`, token);
}

export async function downloadDriveFile(token, driveId) {
  return fetch(`${DRIVE_FILES}/${encodeURIComponent(driveId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
