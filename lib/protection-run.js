'use client';

import { apiFetch } from '@/lib/api-client';
import { uploadProtectedViaServer } from '@/lib/protection-server-client';

export async function runProtectionQueue(items, decisions, onUpdate) {
  const byId = new Map(items.map((item) => [item.localId, item]));
  const counts = { completed: 0, duplicate: 0, skipped: 0, failed: 0 };
  for (const decision of decisions) {
    if (decision.decision === 'SKIP_DUPLICATE') { counts.duplicate += 1; continue; }
    if (decision.decision !== 'ACCEPT') { counts.skipped += 1; continue; }
    const item = byId.get(decision.localId);
    if (!item) continue;
    onUpdate(item.localId, { status: 'uploading', progress: 0 });
    try {
      const result = await uploadProtectedViaServer(item, decision.reservationId, (loaded, total) => onUpdate(item.localId, { progress: Math.min(99, Math.round((loaded / Math.max(total || item.size, 1)) * 100)) }));
      const status = result?.duplicate ? 'duplicate' : 'completed';
      onUpdate(item.localId, { status, progress: 100 });
      counts[status] += 1;
    } catch (error) {
      await apiFetch('/protection/release', { method: 'POST', body: JSON.stringify({ reservationId: decision.reservationId }) }).catch(() => null);
      onUpdate(item.localId, { status: 'failed', progress: 0, error: error?.message || 'Upload failed' });
      counts.failed += 1;
    }
  }
  return counts;
}
