'use client';

import { apiFetch } from '@/lib/api-client';

export async function requestProtectionDecisions(items) {
  const decisions = [];
  for (let index = 0; index < items.length; index += 100) {
    const batch = items.slice(index, index + 100);
    const result = await apiFetch('/protection/preflight', { method: 'POST', body: JSON.stringify({ items: batch }) });
    decisions.push(...(result.decisions || []));
  }
  return decisions;
}
