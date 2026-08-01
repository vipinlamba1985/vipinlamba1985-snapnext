/**
 * Pure selection and summary rules for the backup queue.
 *
 * Safety contract: automatic execution may only ever pick up `queued` work.
 * Items that failed reach `needs_attention`, which is terminal until the user
 * explicitly asks for a retry. This is what stops a new selection, a re-render,
 * a remount or a page refresh from silently re-uploading old failures.
 */

export const UPLOAD_STATUS = {
  queued: 'queued',
  uploading: 'uploading',
  done: 'done',
  skipped: 'skipped',
  needsAttention: 'needs_attention',
};

/** Statuses that represent finished work — nothing here is active. */
export const UPLOAD_TERMINAL_STATUSES = Object.freeze([
  UPLOAD_STATUS.done,
  UPLOAD_STATUS.skipped,
  UPLOAD_STATUS.needsAttention,
]);

/** Reasons that can never succeed on a plain retry of the same file. */
export const NON_RETRYABLE_REASONS = Object.freeze([
  'duplicate',
  'too_large',
  'unsupported_type',
  'authentication_expired',
]);

export function isTerminalStatus(status) {
  return UPLOAD_TERMINAL_STATUSES.includes(String(status || ''));
}

export function isActiveStatus(status) {
  return status === UPLOAD_STATUS.queued || status === UPLOAD_STATUS.uploading;
}

function hasPayload(item) {
  // A released file reference cannot be re-sent; it is not selectable work.
  return Boolean(item?.file);
}

/**
 * Work eligible for an automatic or normal "Start backup" run.
 * Deliberately excludes needs_attention so adding new files never retries old failures.
 */
export function selectAutomaticUploadItems(queue = []) {
  return (Array.isArray(queue) ? queue : []).filter(
    (item) => item?.checked && item?.status === UPLOAD_STATUS.queued && hasPayload(item),
  );
}

/** Items the user may explicitly retry. */
export function retryableItems(queue = []) {
  return (Array.isArray(queue) ? queue : []).filter(
    (item) => item?.status === UPLOAD_STATUS.needsAttention && item?.retryable !== false && hasPayload(item),
  );
}

/**
 * Explicit user-driven retry. Only ever returns items the user selected (or all
 * retryable items when no ids are given) — never silently widens its target.
 */
export function selectManualRetryItems(queue = [], ids = null) {
  const retryable = retryableItems(queue);
  if (!ids) return retryable;
  const wanted = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
  return retryable.filter((item) => wanted.has(String(item.id)));
}

export function isRetryableReason(reason) {
  return !NON_RETRYABLE_REASONS.includes(String(reason || ''));
}

/**
 * Batch state for the progress UI.
 * `complete` is true once no item is still active — a needs_attention item is
 * finished work awaiting a decision, not a reason to keep a spinner running.
 */
export function summarizeBatch(queue = []) {
  const items = Array.isArray(queue) ? queue : [];
  const saved = items.filter((item) => item.status === UPLOAD_STATUS.done).length;
  const skipped = items.filter((item) => item.status === UPLOAD_STATUS.skipped).length;
  const needsAttention = items.filter((item) => item.status === UPLOAD_STATUS.needsAttention).length;
  const waiting = items.filter((item) => item.status === UPLOAD_STATUS.queued && item.checked).length;
  const uploading = items.filter((item) => item.status === UPLOAD_STATUS.uploading).length;
  const total = items.length;
  const finished = saved + skipped + needsAttention;
  const active = waiting + uploading;

  let tone = 'success';
  if (needsAttention > 0) tone = saved > 0 || skipped > 0 ? 'attention' : 'error';

  return {
    total,
    saved,
    skipped,
    needsAttention,
    waiting,
    uploading,
    finished,
    active,
    complete: total > 0 && active === 0,
    tone,
    percent: total ? Math.round((finished / total) * 100) : 0,
  };
}

/** Human batch headline that never reports plain success while work needs attention. */
export function batchHeadline(summary) {
  if (!summary?.total) return 'All caught up';
  if (!summary.complete) return 'Backing up now';
  if (summary.tone === 'error') return 'Backup could not finish';
  if (summary.tone === 'attention') return 'Backup finished with items to review';
  return 'Backup finished';
}
