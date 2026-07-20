export const JOB_STATES = ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled'];

export function normalizeCounts(input = {}, total = 0) {
  const saved = Math.max(0, Number(input.saved) || 0);
  const skipped = Math.max(0, Number(input.skipped) || 0);
  const failed = Math.max(0, Number(input.failed) || 0);
  const completed = Math.min(total, Math.max(0, Number(input.completed) || saved + skipped + failed));
  return { completed, saved, skipped, failed, remaining: Math.max(0, total - completed) };
}

export function canTransition(from, to) {
  const allowed = {
    queued: ['running', 'paused', 'cancelled'],
    running: ['paused', 'completed', 'failed', 'cancelled'],
    paused: ['queued', 'running', 'cancelled'],
    failed: ['queued', 'cancelled'],
    completed: [],
    cancelled: [],
  };
  return Boolean(allowed[from]?.includes(to));
}
