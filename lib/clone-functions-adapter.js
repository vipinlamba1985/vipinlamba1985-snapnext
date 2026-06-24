'use client';

import { apiFetch, getToken, setToken, setStoredUser, logout as localLogout } from '@/lib/api-client';

/**
 * Clone UI function adapter for the Emergent SnapNext UI.
 *
 * Keep the current SnapNext/Emergent UI as the visual source of truth.
 * Bring forward the old snapnext-clone-ui function contract in one safe place.
 * Screens can import this adapter gradually without copying clone-ui demo screens.
 */

const STORAGE_NOT_CONNECTED_MESSAGE = 'S3 storage is not connected. Upload cannot be completed.';

function isNonPersistentUrl(url) {
  return (
    !url ||
    String(url).startsWith('blob:') ||
    String(url).startsWith('blob-stub') ||
    String(url).startsWith('mock/') ||
    String(url).includes('/mock/') ||
    String(url).includes('/mock-')
  );
}

function mediaProxyUrl(objectKey) {
  if (!objectKey || typeof objectKey !== 'string') return '';
  if (!objectKey.startsWith('uploads/')) return '';
  return `/api/media/proxy?key=${encodeURIComponent(objectKey)}`;
}

export function resolveRenderableUrl(item = {}) {
  const key = item.objectKey || item.object_key || item.s3ObjectKey || item.s3_key || item.key || item.id;
  return (
    mediaProxyUrl(key) ||
    item.signedUrl ||
    item.signed_url ||
    item.publicUrl ||
    item.public_url ||
    item.finalUrl ||
    item.final_url ||
    item.thumbnailUrl ||
    item.thumbnail_url ||
    item.url ||
    ''
  );
}

export function normalizeMedia(item = {}) {
  const key = item.objectKey || item.object_key || item.s3ObjectKey || item.s3_key || item.key || item.id;
  const url = resolveRenderableUrl(item);
  return {
    ...item,
    objectKey: key,
    url,
    signedUrl: url,
    publicUrl: url,
    finalUrl: url,
  };
}

async function jsonPost(path, body) {
  return apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

async function jsonPatch(path, body) {
  return apiFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(body || {}),
  });
}

async function jsonDelete(path, body) {
  return apiFetch(path, {
    method: 'DELETE',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const CloneFunctions = {
  // Auth/session bridge
  hasSession() {
    return Boolean(getToken());
  },

  setSession({ token, user }) {
    if (token) setToken(token);
    if (user) setStoredUser(user);
  },

  logout() {
    localLogout();
  },

  // Media library
  async fetchMediaLibrary() {
    const result = await apiFetch('/media');
    const media = Array.isArray(result?.media)
      ? result.media
      : Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result)
          ? result
          : [];
    return { ...result, media: media.map(normalizeMedia) };
  },

  async appendMediaMetadata(payload) {
    const mediaUrl = resolveRenderableUrl(payload);
    if (isNonPersistentUrl(mediaUrl)) {
      throw new Error('Upload cannot be saved because no real S3 image URL was returned.');
    }
    const result = await jsonPost('/media', {
      ...payload,
      url: mediaUrl,
      signedUrl: mediaUrl,
      publicUrl: mediaUrl,
      finalUrl: mediaUrl,
    });
    const media = normalizeMedia(result?.media || result?.data || result);
    return { ...result, success: true, media, data: media };
  },

  async updateMediaDetails(id, updates) {
    const result = await jsonPatch(`/media/${id}`, updates);
    return { ...result, success: true, id, updates };
  },

  async deleteMediaBulk(ids) {
    const result = await jsonDelete('/media/bulk', { ids });
    return { ...result, success: true, ids };
  },

  async toggleFavorite(id, isFavorite) {
    const result = await jsonPost(`/media/${id}/favorite`, { isFavorite });
    return { ...result, success: true, id, isFavorite };
  },

  // Storage upload bridge
  async getS3UploadUrl(filename, contentType, sizeBytes) {
    const result = await jsonPost('/media/upload-url', { filename, contentType, sizeBytes });
    const uploadUrl = result?.uploadUrl || result?.upload_url || result?.signedPutUrl || result?.signed_put_url;
    const signedReadUrl = result?.signedUrl || result?.signed_url || result?.publicUrl || result?.public_url || result?.finalUrl || result?.final_url;
    const objectKey = result?.objectKey || result?.object_key || result?.key;
    const finalUrl = mediaProxyUrl(objectKey) || signedReadUrl;

    if (isNonPersistentUrl(uploadUrl) || isNonPersistentUrl(finalUrl) || !objectKey || String(objectKey).startsWith('mock/')) {
      throw new Error(STORAGE_NOT_CONNECTED_MESSAGE);
    }

    return { ...result, uploadUrl, signedUrl: finalUrl, publicUrl: finalUrl, finalUrl, objectKey, isRealS3: true };
  },

  async uploadFileToS3(uploadUrl, file, onProgress) {
    if (isNonPersistentUrl(uploadUrl)) throw new Error(STORAGE_NOT_CONNECTED_MESSAGE);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve({ success: true });
        else reject(new Error(`S3 upload failed with status ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Network error during S3 upload'));
      xhr.send(file);
    });
  },

  // Profile/billing
  async updateProfileSetting(updates) {
    const result = await jsonPatch('/profile', updates);
    return { ...result, success: true, updates, session: result?.user || result?.session || updates };
  },

  async requestStripeCheckout(plan) {
    const result = await jsonPost('/billing/checkout', { plan });
    const checkoutUrl = result?.checkoutUrl || result?.url;
    return { ...result, checkoutUrl, url: checkoutUrl, isRealStripe: Boolean(checkoutUrl && checkoutUrl !== '#') };
  },

  // Connections / favorites sharing
  async fetchConnections() {
    try {
      return await apiFetch('/connections');
    } catch {
      return { connections: [] };
    }
  },

  async inviteConnection(payload) {
    const result = await jsonPost('/connections/invite', payload);
    return { ...result, success: true, data: result?.data || result?.connection || result };
  },

  // Chat / AI create hooks
  async sendChatMessage(personId, payload) {
    const result = await jsonPost('/chat/send', { personId, ...payload });
    return { ...result, success: true };
  },

  async logCreativeProject(project) {
    const result = await jsonPost('/creative-projects', project);
    return { ...result, success: true, project: result?.project || result?.data || project };
  },

  async fetchCreativeProjects() {
    try {
      return await apiFetch('/creative-projects');
    } catch {
      return { projects: [] };
    }
  },

  // Export / downloads
  async fetchZipExports() {
    try {
      return await apiFetch('/exports');
    } catch {
      return { exports: [], success: true, data: [] };
    }
  },

  async requestZipExport(mediaIds = []) {
    const result = await jsonPost('/exports/zip', { mediaIds });
    return { ...result, success: true };
  },
};

export default CloneFunctions;
