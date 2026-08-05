'use client';

import { apiFetch } from '@/lib/api-client';
import {
  normalizeReservationIds,
  runProtectionDecisionBatches,
} from '@/lib/protection-decision-batches';

const RELEASE_BATCH_SIZE = 200;

export async function releaseProtectionReservations(reservationIds, {
  reason = 'cancelled',
  keepalive = false,
} = {}) {
  const ids = normalizeReservationIds(reservationIds);
  if (!ids.length) return { requested: 0, released: 0, ignored: 0, succeededIds: [], failedIds: [] };

  const batches = [];
  for (let index = 0; index < ids.length; index += RELEASE_BATCH_SIZE) {
    batches.push(ids.slice(index, index + RELEASE_BATCH_SIZE));
  }

  const settled = await Promise.allSettled(batches.map(async (batch) => {
    const result = await apiFetch('/protection/release', {
      method: 'POST',
      keepalive,
      body: JSON.stringify({ reservationIds: batch, reason }),
    });
    return { batch, result };
  }));

  const succeededIds = [];
  const failedIds = [];
  let released = 0;
  let ignored = 0;
  for (let index = 0; index < settled.length; index += 1) {
    const outcome = settled[index];
    const batch = batches[index];
    if (outcome.status === 'fulfilled') {
      succeededIds.push(...batch);
      released += Number(outcome.value.result?.released || 0);
      ignored += Number(outcome.value.result?.ignored || 0);
    } else {
      failedIds.push(...batch);
    }
  }

  return {
    requested: ids.length,
    released,
    ignored,
    succeededIds: normalizeReservationIds(succeededIds),
    failedIds: normalizeReservationIds(failedIds),
  };
}

export async function requestProtectionDecisions(items, options = {}) {
  return runProtectionDecisionBatches(items, {
    ...options,
    fetchBatch: async (batch) => apiFetch('/protection/preflight', {
      method: 'POST',
      body: JSON.stringify({ items: batch }),
    }),
    releaseReservations: releaseProtectionReservations,
  });
}
