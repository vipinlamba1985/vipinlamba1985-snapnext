import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { SMART_SYNC_PROVIDERS } from '../smart-sync.js';
import {
  ACTIVE_SMART_SYNC_JOB_STATUSES,
  createSmartSyncJob,
  publicSmartSyncJob,
} from './jobs.js';

const jobRequestSchema = z.object({
  sourceFileIds: z.array(z.union([z.string(), z.number()])).optional(),
  fileIds: z.array(z.union([z.string(), z.number()])).optional(),
  mode: z.string().trim().min(1).max(40).optional(),
  estimatedItems: z.coerce.number().int().min(0).max(1_000_000).optional(),
  estimatedBytes: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
}).passthrough();

export class SmartSyncJobServiceError extends Error {
  constructor(message, status = 400, code = 'smart_sync_job_invalid') {
    super(message);
    this.name = 'SmartSyncJobServiceError';
    this.status = status;
    this.code = code;
  }
}

export function parseSmartSyncJobRequest(input = {}) {
  const parsed = jobRequestSchema.safeParse(input || {});
  if (!parsed.success) {
    throw new SmartSyncJobServiceError(
      'Smart Sync job settings are invalid. Review the selected files and try again.',
      400,
      'smart_sync_job_request_invalid',
    );
  }

  const sourceFileIds = Array.isArray(parsed.data.sourceFileIds)
    ? parsed.data.sourceFileIds
    : parsed.data.fileIds;

  return {
    sourceFileIds,
    mode: parsed.data.mode || 'automatic',
    estimatedItems: parsed.data.estimatedItems,
    estimatedBytes: parsed.data.estimatedBytes,
  };
}

export async function getSmartSyncProviderReadiness({ db, userId, profile }) {
  const provider = SMART_SYNC_PROVIDERS.find(item => item.id === profile?.providerId);
  if (!provider) {
    throw new SmartSyncJobServiceError('Choose a supported Smart Sync source.', 400, 'provider_unsupported');
  }

  if (provider.surface === 'web') {
    if (provider.syncStrategy !== 'durable_cloud_job') {
      throw new SmartSyncJobServiceError(
        `${provider.name} is visible for setup, but its import worker is not enabled yet.`,
        400,
        'provider_worker_unavailable',
      );
    }
    const connection = await db.collection('cloud_connections').findOne({ userId, provider: profile.providerId });
    if (!connection) {
      throw new SmartSyncJobServiceError(
        `Connect ${provider.name} before creating a sync job.`,
        400,
        'provider_not_connected',
      );
    }
    return { provider, connection };
  }

  const device = profile.nativeDevices?.find(item => item.provider === profile.providerId && item.authorized);
  if (!device) {
    throw new SmartSyncJobServiceError(
      `Authorize ${provider.name} in the SnapNext mobile app first.`,
      400,
      'native_device_not_authorized',
    );
  }
  return { provider, device };
}

export async function listSmartSyncJobs({ db, userId, limit = 50 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const jobs = await db.collection('smart_sync_jobs')
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .toArray();
  return jobs.map(publicSmartSyncJob);
}

export async function createOrReuseSmartSyncJob({ db, userId, profile, body = {} }) {
  if (!profile?.providerId) {
    throw new SmartSyncJobServiceError('Save a Smart Sync source first.', 400, 'profile_source_missing');
  }
  if (!profile.enabled) {
    throw new SmartSyncJobServiceError('Turn on Smart Sync before creating a job.', 400, 'profile_disabled');
  }
  if (!profile.approvedAt) {
    throw new SmartSyncJobServiceError('Review and approve the Smart Sync plan first.', 400, 'profile_not_approved');
  }

  const request = parseSmartSyncJobRequest(body);
  await getSmartSyncProviderReadiness({ db, userId, profile });

  const activeKey = `${userId}:${profile.providerId}`;
  await db.collection('smart_sync_jobs').createIndex({ activeKey: 1 }, { unique: true, sparse: true });

  const existing = await db.collection('smart_sync_jobs').findOne({
    $or: [
      { activeKey },
      { userId, providerId: profile.providerId, status: { $in: ACTIVE_SMART_SYNC_JOB_STATUSES } },
    ],
  });

  if (existing) {
    if (!existing.activeKey) {
      await db.collection('smart_sync_jobs')
        .updateOne({ _id: existing._id }, { $set: { activeKey, updatedAt: new Date() } })
        .catch(() => {});
    }
    return { job: publicSmartSyncJob({ ...existing, activeKey }), existing: true };
  }

  const job = {
    id: uuidv4(),
    ...createSmartSyncJob({
      userId,
      providerId: profile.providerId,
      profile,
      sourceFileIds: request.sourceFileIds,
      mode: request.sourceFileIds?.length ? 'manual_selection' : request.mode,
      estimate: { items: request.estimatedItems, bytes: request.estimatedBytes },
    }),
  };

  try {
    await db.collection('smart_sync_jobs').insertOne(job);
  } catch (error) {
    if (error?.code === 11000) {
      const active = await db.collection('smart_sync_jobs').findOne({ activeKey });
      if (active) return { job: publicSmartSyncJob(active), existing: true };
    }
    throw error;
  }

  return { job: publicSmartSyncJob(job), existing: false };
}
