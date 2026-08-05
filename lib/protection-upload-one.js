'use client';

import { apiFetch } from '@/lib/api-client';
import { uploadProtectedDirect } from '@/lib/protection-direct-client';
import { uploadProtectedViaServer } from '@/lib/protection-server-client';

// Vercel rejects large multipart request bodies before the server route can
// explain the failure. Direct-to-storage is the required path above this size;
// never silently fall back and turn a recoverable S3/CORS issue into a 413.
export const SAFE_SERVER_FALLBACK_BYTES = 3 * 1024 * 1024;

export function canUseServerUploadFallback(item = {}) {
  return Number(item.size || 0) <= SAFE_SERVER_FALLBACK_BYTES;
}

export async function uploadOneProtectedItem(item, decision, onUpdate) {
  onUpdate(item.localId, { status: 'uploading', progress: 0, error: '' });
  const progress = (loaded, total) => onUpdate(item.localId, {
    progress: Math.min(99, Math.round((loaded / Math.max(total || item.size, 1)) * 100)),
  });
  try {
    let result;
    if (decision.uploadMode === 'direct' && decision.uploadUrl) {
      try {
        result = await uploadProtectedDirect(item, decision, progress);
      } catch (directError) {
        if (!canUseServerUploadFallback(item)) {
          const error = new Error('Direct storage upload failed. Retry this file; it was not sent through the size-limited server route.');
          error.code = 'direct_upload_required';
          error.cause = directError;
          throw error;
        }
        result = await uploadProtectedViaServer(item, decision.reservationId, progress);
      }
    } else {
      result = await uploadProtectedViaServer(item, decision.reservationId, progress);
    }
    onUpdate(item.localId, { status: result?.duplicate ? 'duplicate' : 'completed', progress: 100 });
    return result?.duplicate ? 'duplicate' : 'completed';
  } catch (error) {
    await apiFetch('/protection/release', {
      method: 'POST',
      body: JSON.stringify({ reservationId: decision.reservationId }),
    }).catch(() => null);
    onUpdate(item.localId, {
      status: 'failed',
      progress: 0,
      error: error?.message || 'Upload failed',
    });
    return 'failed';
  }
}
