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

export function publicSmartSyncJob(job = {}) {
  const { _id, userId, ...safe } = job;
  return { ...safe, progress: jobProgress(job) };
}
