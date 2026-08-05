'use client';

import { apiFetch } from '@/lib/api-client';
import { uploadProtectedDirect } from '@/lib/protection-direct-client';
import { uploadProtectedViaServer } from '@/lib/protection-server-client';
import { SAFE_SERVER_UPLOAD_BYTES } from '@/lib/protection-upload-limits';

export const SAFE_SERVER_FALLBACK_BYTES = SAFE_SERVER_UPLOAD_BYTES;

export function canUseServerUploadFallback(item = {}) {
  return Number(item.size || 0) <= SAFE_SERVER_UPLOAD_BYTES;
}

function directUploadRequiredError(cause) {
  const error = new Error('Direct storage upload is required for this file. Retry it when the storage connection is available.');
  error.code = 'direct_upload_required';
  error.cause = cause;
  return error;
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
        if (!canUseServerUploadFallback(item)) throw directUploadRequiredError(directError);
        result = await uploadProtectedViaServer(item, decision.reservationId, progress);
      }
    } else {
      if (!canUseServerUploadFallback(item)) throw directUploadRequiredError();
      result = await uploadProtectedViaServer(item, decision.reservationId, progress);
    }

    const status = result?.duplicate ? 'duplicate' : 'completed';
    onUpdate(item.localId, {
      status,
      progress: 100,
      mediaId: result?.item?.id || result?.item?._id || null,
      error: '',
    });
    return status;
  } catch (error) {
    await apiFetch('/protection/release', {
      method: 'POST',
      body: JSON.stringify({ reservationId: decision.reservationId, reason: 'queue_cleanup' }),
    }).catch(() => null);
    onUpdate(item.localId, {
      status: 'failed',
      progress: 0,
      error: error?.message || 'Upload failed',
    });
    return 'failed';
  }
}
