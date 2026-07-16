export function jobProgress(job = {}) {
  const total = Math.max(0, Number(job.estimatedItems) || 0);
  const processed = Math.max(0, Number(job.processedItems) || 0);
  return {
    total,
    processed,
    remaining: Math.max(0, total - processed),
    percent: total ? Math.min(100, Math.round((processed / total) * 100)) : 0,
  };
}

export function nextJobState(job, action) {
  const status = job?.status;
  if (action === 'pause' && ['queued', 'running'].includes(status)) return { status: 'paused', pauseRequested: true, updatedAt: new Date() };
  if (action === 'resume' && status === 'paused') return { status: 'queued', pauseRequested: false, lastError: null, updatedAt: new Date() };
  if (action === 'stop' && !['completed', 'stopped'].includes(status)) return { status: 'stopped', stopRequested: true, completedAt: new Date(), updatedAt: new Date() };
  if (action === 'retry' && status === 'failed') return { status: 'queued', lastError: null, retryCount: (job.retryCount || 0) + 1, pauseRequested: false, stopRequested: false, updatedAt: new Date() };
  return null;
}

export function publicSmartSyncJob(job = {}) {
  const { _id, userId, ...safe } = job;
  return { ...safe, progress: jobProgress(job) };
}
