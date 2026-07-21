import { normalizeSyncMetrics } from './cloud-assets.js';

export const SMART_SYNC_JOB_STATUSES = ['queued', 'running', 'paused', 'completed', 'failed', 'stopped'];
export const ACTIVE_SMART_SYNC_JOB_STATUSES = ['queued', 'running', 'paused'];
export const SMART_SYNC_BATCH_SIZE = 10;

export function normalizeSourceFileIds(input, limit = 500) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(value => String(value || '').trim()).filter(Boolean))].slice(0, limit);
}

export function jobProgress(job = {}) {
  const total = Math.max(0, Number(job.estimatedItems) || Number(job.sourceFileIds?.length) || 0);
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
  const now = new Date();
  if (action === 'pause' && ['queued', 'running'].includes(status)) {
    return { status: 'paused', pauseRequested: true, updatedAt: now };
  }
  if (action === 'resume' && status === 'paused') {
    return { status: 'queued', pauseRequested: false, stopRequested: false, lastError: null, updatedAt: now };
  }
  if (action === 'stop' && !['completed', 'stopped'].includes(status)) {
    return { status: 'stopped', stopRequested: true, pauseRequested: false, completedAt: now, updatedAt: now };
  }
  if (action === 'retry' && status === 'failed') {
    return {
      status: 'queued',
      lastError: null,
      retryCount: (Number(job.retryCount) || 0) + 1,
      pauseRequested: false,
      stopRequested: false,
      completedAt: null,
      updatedAt: now,
    };
  }
  return null;
}

export function createSmartSyncJob({ userId, providerId, profile, sourceFileIds, mode = 'automatic', estimate = {} }) {
  const now = new Date();
  const ids = normalizeSourceFileIds(sourceFileIds);
  const estimatedItems = Math.max(0, Number(estimate.items) || ids.length || 0);
  const estimatedBytes = Math.max(0, Number(estimate.bytes) || 0);
  return {
    userId,
    providerId,
    mode,
    rules: Array.isArray(profile?.rules) ? profile.rules : [],
    sourceFileIds: ids,
    status: 'queued',
    activeKey: `${userId}:${providerId}`,
    estimatedItems,
    estimatedBytes,
    processedItems: 0,
    importedItems: 0,
    skippedItems: 0,
    failedItems: 0,
    processedBytes: 0,
    metrics: normalizeSyncMetrics(),
    cursorIndex: 0,
    discoveryPageToken: null,
    pendingPageToken: null,
    pendingNewStartPageToken: null,
    sourceCursorAt: null,
    maxSourceModifiedAt: null,
    lastError: null,
    retryCount: 0,
    pauseRequested: false,
    stopRequested: false,
    completionReason: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };
}

export function publicSmartSyncJob(job = {}) {
  const {
    _id,
    userId,
    activeKey,
    sourceFileIds,
    discoveryPageToken,
    pendingPageToken,
    pendingNewStartPageToken,
    leaseToken,
    leaseUntil,
    ...safe
  } = job;
  return {
    ...safe,
    metrics: normalizeSyncMetrics(job.metrics),
    fileCount: Array.isArray(sourceFileIds) ? sourceFileIds.length : Number(job.estimatedItems) || 0,
    progress: jobProgress(job),
  };
}

export function terminalJobPatch(status, extra = {}) {
  const now = new Date();
  return {
    status,
    completedAt: now,
    updatedAt: now,
    pauseRequested: false,
    stopRequested: status === 'stopped',
    ...extra,
  };
}
