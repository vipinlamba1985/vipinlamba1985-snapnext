'use client';

import { runConcurrent } from '@/lib/concurrent-work';
import { uploadOneProtectedItem } from '@/lib/protection-upload-one';

export async function runProtectionQueue(items, decisions, onUpdate) {
  const byId = new Map(items.map((item) => [item.localId, item]));
  const counts = { completed: 0, duplicate: 0, skipped: 0, failed: 0 };
  const accepted = [];
  for (const decision of decisions) {
    if (decision.decision === 'SKIP_DUPLICATE') counts.duplicate += 1;
    else if (decision.decision !== 'ACCEPT') counts.skipped += 1;
    else if (byId.get(decision.localId)) accepted.push({ decision, item: byId.get(decision.localId) });
  }
  for (const row of accepted) {
    const status = await uploadOneProtectedItem(row.item, row.decision, onUpdate);
    counts[status] += 1;
  }
  return counts;
}
