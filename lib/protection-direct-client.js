'use client';

import { apiFetch } from '@/lib/api-client';

function putFile(url, item, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', item.mime || 'application/octet-stream');
    xhr.upload.onprogress = (event) => onProgress?.(event.loaded || 0, event.total || item.size);
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Direct upload failed'));
    xhr.onerror = () => reject(new Error('Direct upload failed'));
    xhr.send(item.file);
  });
}

export async function uploadProtectedDirect(item, decision, onProgress) {
  await putFile(decision.uploadUrl, item, onProgress);
  return apiFetch('/protection/complete', { method: 'POST', body: JSON.stringify({ reservationId: decision.reservationId }) });
}
