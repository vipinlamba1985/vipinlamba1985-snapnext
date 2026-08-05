export const PROTECTION_DECISION_BATCH_SIZE = 100;

export class ProtectionPreparationCancelledError extends Error {
  constructor(message = 'Upload preparation was replaced by a newer selection.') {
    super(message);
    this.name = 'ProtectionPreparationCancelledError';
    this.code = 'protection_preparation_cancelled';
  }
}

export function normalizeReservationIds(values = [], limit = Number.MAX_SAFE_INTEGER) {
  const source = Array.isArray(values) ? values : [values];
  const output = [];
  const seen = new Set();
  for (const value of source) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length >= limit) break;
  }
  return output;
}

export function reservationIdsFromDecisions(decisions = []) {
  return normalizeReservationIds(decisions
    .filter((decision) => decision?.decision === 'ACCEPT')
    .map((decision) => decision.reservationId));
}

function cancelled(isCurrent) {
  return typeof isCurrent === 'function' && !isCurrent();
}

export async function runProtectionDecisionBatches(items = [], {
  batchSize = PROTECTION_DECISION_BATCH_SIZE,
  fetchBatch,
  releaseReservations,
  onBatch,
  isCurrent = () => true,
} = {}) {
  if (typeof fetchBatch !== 'function') throw new TypeError('fetchBatch is required');
  if (typeof releaseReservations !== 'function') throw new TypeError('releaseReservations is required');

  const decisions = [];
  const createdReservationIds = new Set();

  try {
    for (let index = 0; index < items.length; index += batchSize) {
      if (cancelled(isCurrent)) throw new ProtectionPreparationCancelledError();

      const result = await fetchBatch(items.slice(index, index + batchSize));
      const batchDecisions = Array.isArray(result?.decisions) ? result.decisions : [];
      for (const id of reservationIdsFromDecisions(batchDecisions)) createdReservationIds.add(id);
      onBatch?.(batchDecisions, result);

      if (cancelled(isCurrent)) throw new ProtectionPreparationCancelledError();
      decisions.push(...batchDecisions);
    }
    return decisions;
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error(String(caught || 'Protection preflight failed'));
    const ids = [...createdReservationIds];
    if (ids.length) {
      try {
        const cleanup = await releaseReservations(ids, {
          reason: error?.code === 'protection_preparation_cancelled' ? 'stale_preflight' : 'preflight_failed',
        });
        const failed = normalizeReservationIds(cleanup?.failedIds || []);
        if (failed.length) error.unreleasedReservationIds = failed;
      } catch {
        error.unreleasedReservationIds = ids;
      }
    }
    throw error;
  }
}
