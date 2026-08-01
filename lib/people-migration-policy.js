/**
 * Loop-control policy for the People backfill.
 *
 * Background: the automatic pass is driven by a React effect that re-evaluates
 * whenever the migration snapshot or the `building` flag changes. Without an
 * explicit stop condition, a batch that can never progress (every candidate
 * fails, or the engine is unavailable) leaves `remaining > 0` forever, so the
 * effect reschedules itself indefinitely. These helpers make the stop
 * conditions explicit and testable:
 *
 *  - automatic work may only ever target `queued` items, never failures;
 *  - a pass that processed nothing ends automatic continuation for the session;
 *  - failures are terminal until the user explicitly retries them.
 */

export const MAX_AUTOMATIC_BATCHES = 6;
export const AUTOMATIC_BATCH_DELAY_MS = 700;

function count(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/**
 * Whether the automatic (unattended) backfill pass may start.
 * Automatic runs never target failed items — only genuinely queued remaining work.
 */
export function shouldStartAutomaticPass({
  loading = false,
  engineReady = false,
  building = false,
  repairing = false,
  paused = false,
  needsMigration = false,
  selfRepairRequired = false,
  remaining = 0,
  exhausted = false,
} = {}) {
  if (loading || building || repairing || paused || exhausted) return false;
  if (!engineReady || selfRepairRequired || !needsMigration) return false;
  return count(remaining) > 0;
}

/**
 * Whether an in-flight automatic run should request another batch.
 * Stops as soon as a batch makes no progress, which is what prevents a
 * permanently-failing candidate set from looping.
 */
export function shouldContinueAutomaticBatch({
  batchIndex = 0,
  maxBatches = MAX_AUTOMATIC_BATCHES,
  remaining = 0,
  lastBatchProcessed = null,
} = {}) {
  if (batchIndex >= count(maxBatches)) return false;
  if (count(remaining) <= 0) return false;
  // First batch has no prior result to judge; afterwards require real progress.
  if (lastBatchProcessed !== null && count(lastBatchProcessed) <= 0) return false;
  return true;
}

/**
 * After a run finishes, decide whether automatic continuation stays enabled.
 * When a run ends with work still remaining but nothing processed, automatic
 * mode is exhausted for this session and only an explicit user action resumes it.
 */
export function automaticContinuationExhausted({ totalProcessed = 0, remaining = 0 } = {}) {
  return count(remaining) > 0 && count(totalProcessed) === 0;
}

/**
 * Migration snapshot -> UI state.
 * Failed items are surfaced as "needs attention", which is finished work, so a
 * snapshot with only failures left is complete and must not show a spinner.
 */
export function describeMigration(migration) {
  const total = count(migration?.total);
  const completed = count(migration?.completed ?? migration?.checked);
  const remaining = count(migration?.remaining);
  const failed = count(migration?.failed);
  return {
    total,
    completed,
    remaining,
    failed,
    percent: total ? Math.min(100, Math.round((completed / total) * 100)) : 0,
    hasActiveWork: remaining > 0,
    needsAttention: failed > 0,
    complete: remaining === 0,
  };
}
