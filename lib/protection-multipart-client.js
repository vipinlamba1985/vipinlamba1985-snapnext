'use client';

import { apiFetch } from '@/lib/api-client';
import { clearMultipartResume, loadMultipartResume, saveMultipartResume } from '@/lib/multipart-resume-store';

async function uploadPart(url, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.upload.onprogress = (event) => onProgress?.(event.loaded || 0, event.total || blob.size);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader('ETag'));
      else reject(new Error(`Part upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Part upload failed'));
    xhr.send(blob);
  });
}

export async function uploadProtectedMultipart(item, decision, onProgress) {
  const partSize = Number(decision.partSize || 16 * 1024 * 1024);
  const totalParts = Number(decision.totalParts || Math.ceil(item.size / partSize));
  const stored = await loadMultipartResume(decision.reservationId);
  const completed = new Map((stored?.parts || []).map((part) => [part.partNumber, part]));
  let completedBytes = 0;
  for (const part of completed.values()) {
    const start = (part.partNumber - 1) * partSize;
    completedBytes += Math.min(partSize, Math.max(0, item.size - start));
  }
  onProgress?.(completedBytes, item.size);

  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    if (completed.has(partNumber)) continue;
    const start = (partNumber - 1) * partSize;
    const end = Math.min(item.size, start + partSize);
    const blob = item.file.slice(start, end);
    const signed = await apiFetch('/protection/multipart/part', { method: 'POST', body: JSON.stringify({ reservationId: decision.reservationId, partNumber }) });
    const etag = await uploadPart(signed.url, blob, (loaded) => onProgress?.(completedBytes + loaded, item.size));
    if (!etag) throw new Error('S3 did not return an ETag for a completed part');
    const part = { partNumber, etag };
    completed.set(partNumber, part);
    completedBytes += blob.size;
    await saveMultipartResume({ reservationId: decision.reservationId, fingerprint: `${item.name}:${item.size}:${item.file.lastModified}`, parts: [...completed.values()] });
    onProgress?.(completedBytes, item.size);
  }

  const result = await apiFetch('/protection/multipart/complete', {
    method: 'POST',
    body: JSON.stringify({ reservationId: decision.reservationId, parts: [...completed.values()] }),
  });
  await clearMultipartResume(decision.reservationId);
  return result;
}
