'use client';

import { apiFetch } from '@/lib/api-client';
import { uploadProtectedDirect } from '@/lib/protection-direct-client';
import { uploadProtectedMultipart } from '@/lib/protection-multipart-client';
import { uploadProtectedViaServer } from '@/lib/protection-server-client';

export async function uploadOneProtectedItem(item, decision, onUpdate) {
  onUpdate(item.localId, { status: 'uploading', progress: 0 });
  const progress = (loaded, total) => onUpdate(item.localId, { progress: Math.min(99, Math.round((loaded / Math.max(total || item.size, 1)) * 100)) });
  try {
    let result;
    if (decision.uploadMode === 'multipart') {
      result = await uploadProtectedMultipart(item, decision, progress);
    } else if (decision.uploadMode === 'direct' && decision.uploadUrl) {
      try { result = await uploadProtectedDirect(item, decision, progress); }
      catch { result = await uploadProtectedViaServer(item, decision.reservationId, progress); }
    } else {
      result = await uploadProtectedViaServer(item, decision.reservationId, progress);
    }
    onUpdate(item.localId, { status: result?.duplicate ? 'duplicate' : 'completed', progress: 100 });
    return result?.duplicate ? 'duplicate' : 'completed';
  } catch (error) {
    await apiFetch('/protection/release', { method: 'POST', body: JSON.stringify({ reservationId: decision.reservationId }) }).catch(() => null);
    onUpdate(item.localId, { status: 'failed', progress: 0, error: error?.message || 'Upload failed' });
    return 'failed';
  }
}
