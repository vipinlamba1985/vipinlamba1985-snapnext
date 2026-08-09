'use client';

import { apiFetch } from '@/lib/api-client';
import { uploadProtectedDirect } from '@/lib/protection-direct-client';
import { uploadProtectedViaServer } from '@/lib/protection-server-client';
import { SAFE_SERVER_UPLOAD_BYTES } from '@/lib/protection-upload-limits';
import {
  buildWebFaceAnalysisIfEnabled,
  persistWebFaceAnalysis,
  recordWebFaceAnalysisFailure,
} from '@/lib/intelligence/web-face-analysis';

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

async function finishLocalPhotoAnalysis(mediaId, prepared) {
  if (!mediaId || !prepared) return;
  if (prepared.error) {
    await recordWebFaceAnalysisFailure(mediaId, prepared.error).catch(() => null);
    return;
  }
  if (!prepared.analysis) return;
  try {
    await persistWebFaceAnalysis(mediaId, prepared.analysis);
  } catch (error) {
    await recordWebFaceAnalysisFailure(mediaId, error).catch(() => null);
  }
}

export async function uploadOneProtectedItem(item, decision, onUpdate) {
  onUpdate(item.localId, { status: 'uploading', progress: 0, error: '' });
  const progress = (loaded, total) => onUpdate(item.localId, {
    progress: Math.min(99, Math.round((loaded / Math.max(total || item.size, 1)) * 100)),
  });

  // Start trusted local face counting only after the user presses Back up, and
  // overlap it with the network transfer. No AWS call is made here. If rollout
  // flags are off this resolves to null without creating a worker.
  const localAnalysisPromise = item.kind === 'photo' && item.file
    ? buildWebFaceAnalysisIfEnabled(item.file)
      .then((analysis) => ({ analysis, error: null }))
      .catch((error) => ({ analysis: null, error }))
    : Promise.resolve(null);

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
    const mediaId = result?.item?.id || result?.item?._id || null;
    onUpdate(item.localId, {
      status,
      progress: 100,
      mediaId,
      error: '',
    });

    // A local-analysis problem must never turn a successful backup into a
    // failed backup. It is recorded with retry backoff for the finite catch-up
    // queue instead.
    await finishLocalPhotoAnalysis(mediaId, await localAnalysisPromise);
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
