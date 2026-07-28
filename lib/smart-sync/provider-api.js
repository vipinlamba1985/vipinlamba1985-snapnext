import { decryptCloudToken, encryptCloudToken } from '@/lib/cloud-token-crypto';
import { oauthAdapter } from '@/lib/smart-sync/oauth-adapters';

const DROPBOX_API = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT = 'https://content.dropboxapi.com/2';
const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const PHOTOS_PICKER_API = 'https://photospicker.googleapis.com/v1';

const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp', avif: 'image/avif',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', avi: 'video/x-msvideo',
  mkv: 'video/x-matroska', '3gp': 'video/3gpp', mpeg: 'video/mpeg', mpg: 'video/mpeg',
};

function providerName(provider) {
  return provider === 'google_photos' ? 'Google Photos' : provider === 'onedrive' ? 'OneDrive' : provider === 'dropbox' ? 'Dropbox' : 'cloud source';
}

function mimeFromName(name = '') {
  const extension = String(name).toLowerCase().split('.').pop();
  return MIME_BY_EXTENSION[extension] || 'application/octet-stream';
}

async function responseJson(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error_summary || data?.error?.message || data?.error_description || data?.message || fallback;
    const error = new Error(String(message || fallback).slice(0, 500));
    error.status = response.status;
    error.code = data?.error?.code || data?.error || null;
    throw error;
  }
  return data;
}

export async function freshProviderAccessToken(db, connection) {
  const provider = connection?.provider;
  if (!provider) throw new Error('Cloud connection is unavailable.');
  if (connection.accessToken && (!connection.expiresAt || new Date(connection.expiresAt).getTime() > Date.now() + 60_000)) {
    return decryptCloudToken(connection.accessToken);
  }
  if (!connection.refreshToken) throw new Error(`Reconnect ${providerName(provider)}.`);

  const adapter = oauthAdapter(provider);
  if (!adapter) throw new Error(`Reconnect ${providerName(provider)}.`);
  const params = new URLSearchParams({
    client_id: process.env[adapter.clientIdEnv] || '',
    client_secret: process.env[adapter.clientSecretEnv] || '',
    refresh_token: decryptCloudToken(connection.refreshToken),
    grant_type: 'refresh_token',
  });
  if (provider === 'onedrive') params.set('scope', adapter.scopes.join(' '));

  const response = await fetch(adapter.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await responseJson(response, `Reconnect ${providerName(provider)}.`);
  if (!data.access_token) throw new Error(`Reconnect ${providerName(provider)}.`);

  const set = {
    accessToken: encryptCloudToken(data.access_token),
    expiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null,
    updatedAt: new Date(),
  };
  if (data.refresh_token) set.refreshToken = encryptCloudToken(data.refresh_token);
  if (data.scope) set.scope = data.scope;
  await db.collection('cloud_connections').updateOne({ _id: connection._id }, { $set: set });
  return data.access_token;
}

export function normalizeDropboxEntry(entry = {}) {
  const tag = entry['.tag'];
  if (tag === 'deleted') {
    return {
      id: String(entry.id || entry.path_lower || entry.path_display || ''),
      name: String(entry.name || entry.path_display || 'Removed Dropbox item'),
      sourceState: 'removed',
      supported: false,
      providerPath: entry.path_lower || entry.path_display || null,
    };
  }
  if (tag !== 'file') return null;
  const mime = mimeFromName(entry.name);
  return {
    id: String(entry.id || entry.path_lower || ''),
    name: String(entry.name || 'Untitled memory'),
    mime,
    kind: mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'photo' : 'other',
    size: Number(entry.size || 0),
    favorite: false,
    createdAt: entry.client_modified || entry.server_modified || null,
    modifiedAt: entry.server_modified || entry.client_modified || null,
    providerChecksum: entry.content_hash ? { algorithm: 'dropbox_content_hash', value: String(entry.content_hash).toLowerCase() } : null,
    providerVersion: entry.rev ? String(entry.rev) : null,
    sourceState: 'active',
    supported: mime.startsWith('image/') || mime.startsWith('video/'),
    providerPath: entry.id || entry.path_lower || entry.path_display || null,
  };
}

export async function listDropboxPage(token, cursor = null) {
  const response = await fetch(`${DROPBOX_API}/files/${cursor ? 'list_folder/continue' : 'list_folder'}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cursor ? { cursor } : {
      path: '',
      recursive: true,
      include_deleted: true,
      include_non_downloadable_files: false,
      limit: 500,
    }),
  });
  const data = await responseJson(response, 'Dropbox could not be checked.');
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    cursor: data.cursor || cursor || null,
    hasMore: Boolean(data.has_more),
  };
}

export async function downloadDropboxFile(token, reference) {
  return fetch(`${DROPBOX_CONTENT}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path: reference }),
    },
  });
}

function oneDriveChecksum(item = {}) {
  const hashes = item.file?.hashes || {};
  const candidates = [
    ['sha256', hashes.sha256Hash],
    ['sha1', hashes.sha1Hash],
    ['quickxor', hashes.quickXorHash],
    ['crc32', hashes.crc32Hash],
  ];
  const match = candidates.find(([, value]) => String(value || '').trim());
  return match ? { algorithm: match[0], value: String(match[1]).trim().toLowerCase() } : null;
}

export function normalizeOneDriveEntry(item = {}) {
  if (item.deleted) {
    return {
      id: String(item.id || ''),
      name: String(item.name || 'Removed OneDrive item'),
      sourceState: 'removed',
      supported: false,
    };
  }
  if (!item.file) return null;
  const mime = String(item.file.mimeType || mimeFromName(item.name));
  return {
    id: String(item.id || ''),
    name: String(item.name || 'Untitled memory'),
    mime,
    kind: mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'photo' : 'other',
    size: Number(item.size || 0),
    favorite: false,
    createdAt: item.createdDateTime || null,
    modifiedAt: item.lastModifiedDateTime || item.createdDateTime || null,
    providerChecksum: oneDriveChecksum(item),
    providerVersion: item.eTag || item.cTag || null,
    sourceState: 'active',
    supported: mime.startsWith('image/') || mime.startsWith('video/'),
    downloadUrl: item['@microsoft.graph.downloadUrl'] || null,
  };
}

export async function listOneDrivePage(token, cursor = null) {
  const initial = `${GRAPH_API}/me/drive/root/delta?$select=${encodeURIComponent('id,name,size,file,folder,deleted,createdDateTime,lastModifiedDateTime,eTag,cTag,@microsoft.graph.downloadUrl,parentReference')}`;
  const response = await fetch(cursor || initial, { headers: { Authorization: `Bearer ${token}` } });
  const data = await responseJson(response, 'OneDrive could not be checked.');
  return {
    entries: Array.isArray(data.value) ? data.value : [],
    nextLink: data['@odata.nextLink'] || null,
    deltaLink: data['@odata.deltaLink'] || null,
  };
}

export async function downloadOneDriveFile(token, providerFileId, downloadUrl = null) {
  if (downloadUrl) return fetch(downloadUrl);
  return fetch(`${GRAPH_API}/me/drive/items/${encodeURIComponent(providerFileId)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
  });
}

export function normalizeGooglePhotosItem(item = {}) {
  const media = item.mediaFile || {};
  const mime = String(media.mimeType || '');
  return {
    id: String(item.id || ''),
    name: String(media.filename || 'Google Photos memory'),
    mime,
    kind: mime.startsWith('video/') || item.type === 'VIDEO' ? 'video' : mime.startsWith('image/') || item.type === 'PHOTO' ? 'photo' : 'other',
    size: 0,
    favorite: false,
    createdAt: item.createTime || null,
    modifiedAt: item.createTime || null,
    providerChecksum: null,
    providerVersion: item.createTime || null,
    sourceState: 'active',
    supported: mime.startsWith('image/') || mime.startsWith('video/'),
    downloadUrl: media.baseUrl || null,
    downloadExpiresAt: new Date(Date.now() + 55 * 60 * 1000),
  };
}

export async function createGooglePhotosPickerSession(token, maxItemCount = 500) {
  const response = await fetch(`${PHOTOS_PICKER_API}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pickingConfig: { maxItemCount: String(Math.min(Math.max(Number(maxItemCount) || 500, 1), 2000)) } }),
  });
  return responseJson(response, 'Google Photos could not start a selection session.');
}

export async function getGooglePhotosPickerSession(token, sessionId) {
  const response = await fetch(`${PHOTOS_PICKER_API}/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return responseJson(response, 'Google Photos selection could not be checked.');
}

export async function listGooglePhotosItems(token, sessionId, pageToken = '') {
  const params = new URLSearchParams({ sessionId, pageSize: '100' });
  if (pageToken) params.set('pageToken', pageToken);
  const response = await fetch(`${PHOTOS_PICKER_API}/mediaItems?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await responseJson(response, 'Selected Google Photos could not be listed.');
  return { items: Array.isArray(data.mediaItems) ? data.mediaItems : [], nextPageToken: data.nextPageToken || null };
}

export async function deleteGooglePhotosPickerSession(token, sessionId) {
  const response = await fetch(`${PHOTOS_PICKER_API}/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) await responseJson(response, 'Google Photos session cleanup failed.');
}

export async function downloadGooglePhotosFile(token, asset) {
  if (!asset?.downloadUrl || (asset.downloadExpiresAt && new Date(asset.downloadExpiresAt).getTime() <= Date.now())) {
    const error = new Error('This Google Photos selection expired. Choose the items again.');
    error.code = 'google_photos_selection_expired';
    throw error;
  }
  const suffix = asset.mime?.startsWith('video/') ? '=dv' : '=d';
  return fetch(`${asset.downloadUrl}${suffix}`, { headers: { Authorization: `Bearer ${token}` } });
}
