import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '@/lib/storage';
import { entitlementForUser } from '@/lib/entitlements';
import { decryptCloudToken, encryptCloudToken } from '@/lib/cloud-token-crypto';
import { createSmartSyncJob, SMART_SYNC_BATCH_SIZE, terminalJobPatch } from '@/lib/smart-sync/jobs';

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_FILES = 500;
const LEASE_MS = 4 * 60 * 1000;

function enabledRules(job = {}) {
  return (Array.isArray(job.rules) ? job.rules : [])
    .filter(rule => rule?.enabled !== false)
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0));
}

function ruleRank(meta, rules) {
  const kind = meta.mimeType?.startsWith('video/') ? 'video' : 'photo';
  const index = rules.findIndex(rule => {
    if (rule.type === 'photos_first') return kind === 'photo';
    if (rule.type === 'videos_first') return kind === 'video';
    if (['recent', 'everything', 'manual'].includes(rule.type)) return true;
    return false;
  });
  return index >= 0 ? index : 999;
}

async function freshAccessToken(db, connection) {
  if (connection.accessToken && connection.expiresAt && new Date(connection.expiresAt).getTime() > Date.now() + 60_000) {
    return decryptCloudToken(connection.accessToken);
  }
  if (!connection.refreshToken) throw new Error('Reconnect Google Drive.');
  const response = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || '',
      refresh_token: decryptCloudToken(connection.refreshToken),
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Reconnect Google Drive.');
  const expiresAt = new Date(Date.now() + Number(data.expires_in || 3600) * 1000);
  await db.collection('cloud_connections').updateOne(
    { _id: connection._id },
    { $set: { accessToken: encryptCloudToken(data.access_token), expiresAt, updatedAt: new Date() } },
  );
  return data.access_token;
}

async function listDriveCandidates(token, { after, before, rules, limit = MAX_SOURCE_FILES } = {}) {
  const items = [];
  let pageToken = '';
  while (items.length < limit) {
    const queryParts = ["trashed = false", "(mimeType contains 'image/' or mimeType contains 'video/')"];
    if (after) queryParts.push(`modifiedTime > '${new Date(after).toISOString()}'`);
    if (before) queryParts.push(`modifiedTime < '${new Date(before).toISOString()}'`);
    const params = new URLSearchParams({
      q: queryParts.join(' and '),
      fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime)',
      pageSize: '100',
      orderBy: 'modifiedTime desc',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(`${DRIVE_FILES}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error('Google Drive could not be checked.');
    items.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return items
    .slice(0, limit)
    .sort((a, b) => ruleRank(a, rules) - ruleRank(b, rules) || new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0));
}

async function currentUsage(db, userId) {
  const [usage] = await db.collection('media').aggregate([
    { $match: { userId, trashed: { $ne: true } } },
    { $group: { _id: null, bytes: { $sum: '$size' } } },
  ]).toArray();
  return Number(usage?.bytes || 0);
}

async function importDriveFile({ db, token, user, driveId, usedBytes }) {
  const metaResponse = await fetch(
    `${DRIVE_FILES}/${encodeURIComponent(driveId)}?fields=id,name,mimeType,size,createdTime,modifiedTime`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const meta = await metaResponse.json();
  if (!metaResponse.ok || (!meta.mimeType?.startsWith('image/') && !meta.mimeType?.startsWith('video/'))) {
    return { status: 'failed', size: 0, modifiedAt: null, message: 'Unsupported or unavailable Drive item.' };
  }

  const size = Number(meta.size || 0);
  const modifiedAt = meta.modifiedTime || meta.createdTime || null;
  if (!size || size > MAX_IMPORT_BYTES) return { status: 'failed', size: 0, modifiedAt, message: 'File is too large for cloud import.' };

  const sourceDuplicate = await db.collection('media').findOne({
    userId: user.id,
    'cloudSource.provider': 'google_drive',
    'cloudSource.fileId': driveId,
  });
  if (sourceDuplicate) return { status: 'skipped', size: 0, modifiedAt };

  const entitlement = entitlementForUser(user);
  const limitBytes = entitlement.realIsSuper ? 0 : Number(entitlement.plan.storageBytes || 0);
  if (limitBytes && usedBytes + size > limitBytes) {
    return { status: 'capacity', size: 0, modifiedAt, message: 'Storage capacity reached.' };
  }

  const fileResponse = await fetch(`${DRIVE_FILES}/${encodeURIComponent(driveId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileResponse.ok) return { status: 'failed', size: 0, modifiedAt, message: 'Drive item could not be copied.' };

  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const hashDuplicate = await db.collection('media').findOne({ userId: user.id, hash, trashed: { $ne: true } });
  if (hashDuplicate) return { status: 'skipped', size: 0, modifiedAt };

  const id = uuidv4();
  const saved = await storage.save({ userId: user.id, fileId: id, buffer, name: meta.name, mime: meta.mimeType });
  await db.collection('media').insertOne({
    id,
    userId: user.id,
    name: meta.name,
    size: buffer.length,
    hash,
    mime: meta.mimeType,
    kind: meta.mimeType.startsWith('video/') ? 'video' : 'photo',
    storageKey: saved.storageKey,
    provider: saved.provider,
    favorite: false,
    trashed: false,
    cloudSource: { provider: 'google_drive', fileId: driveId, importedAt: new Date(), smartSync: true },
    aiAnalysis: { tags: [], faces: [], autoAlbum: 'Cloud Imports' },
    createdAt: meta.createdTime ? new Date(meta.createdTime) : new Date(),
  });
  return { status: 'saved', size: buffer.length, modifiedAt };
}

async function claimJob(db, jobId, userId) {
  const now = new Date();
  const leaseToken = uuidv4();
  const result = await db.collection('smart_sync_jobs').updateOne(
    {
      id: jobId,
      ...(userId ? { userId } : {}),
      status: { $in: ['queued', 'running'] },
      pauseRequested: { $ne: true },
      stopRequested: { $ne: true },
      $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
    },
    {
      $set: {
        status: 'running',
        leaseToken,
        leaseUntil: new Date(Date.now() + LEASE_MS),
        startedAt: now,
        updatedAt: now,
      },
    },
  );
  if (!result.modifiedCount) return null;
  return db.collection('smart_sync_jobs').findOne({ id: jobId, ...(userId ? { userId } : {}), leaseToken });
}

async function releaseLease(db, job, update, unset = {}) {
  await db.collection('smart_sync_jobs').updateOne(
    { id: job.id, userId: job.userId, leaseToken: job.leaseToken },
    { $set: update, $unset: { leaseToken: '', leaseUntil: '', ...unset } },
  );
}

export async function processGoogleDriveJobBatch({ db, jobId, userId = null }) {
  let job = await claimJob(db, jobId, userId);
  if (!job) return { claimed: false };

  try {
    const [user, connection, profile] = await Promise.all([
      db.collection('users').findOne({ id: job.userId }),
      db.collection('cloud_connections').findOne({ userId: job.userId, provider: 'google_drive' }),
      db.collection('smart_sync_profiles').findOne({ userId: job.userId }),
    ]);
    if (!user) throw new Error('User account not found.');
    if (!connection) throw new Error('Reconnect Google Drive.');
    if (!profile?.approvedAt || !profile.enabled || profile.providerId !== 'google_drive') {
      throw new Error('Smart Sync is not approved and active for Google Drive.');
    }

    const token = await freshAccessToken(db, connection);
    if (!Array.isArray(job.sourceFileIds) || !job.sourceFileIds.length) {
      const initialMode = !connection.smartSyncInitialCompleted;
      const after = initialMode ? null : connection.smartSyncCursorAt || connection.connectedAt;
      const before = initialMode ? connection.smartSyncInitialBeforeAt || null : null;
      const candidates = await listDriveCandidates(token, { after, before, rules: enabledRules(job) });
      if (!candidates.length) {
        await releaseLease(db, job, terminalJobPatch('completed', { completionReason: 'no_changes' }), { activeKey: '' });
        const set = { lastAutoSyncAt: new Date(), updatedAt: new Date() };
        if (initialMode) {
          set.smartSyncInitialCompleted = true;
          set.smartSyncCursorAt = connection.smartSyncInitialNewestAt || connection.connectedAt || new Date();
        }
        await db.collection('cloud_connections').updateOne({ _id: connection._id }, { $set: set });
        return { claimed: true, completed: true, reason: 'no_changes' };
      }
      const sourceFileIds = candidates.map(item => item.id);
      const estimatedBytes = candidates.reduce((sum, item) => sum + Math.max(0, Number(item.size || 0)), 0);
      const sourceCursorAt = candidates.reduce((latest, item) => {
        const value = new Date(item.modifiedTime || item.createdTime || 0);
        return value > latest ? value : latest;
      }, new Date(0));
      const sourceOldestAt = candidates.reduce((oldest, item) => {
        const value = new Date(item.modifiedTime || item.createdTime || 0);
        return !oldest || value < oldest ? value : oldest;
      }, null);
      await db.collection('smart_sync_jobs').updateOne(
        { id: job.id, userId: job.userId, leaseToken: job.leaseToken },
        { $set: { sourceFileIds, estimatedItems: sourceFileIds.length, estimatedBytes, sourceCursorAt, sourceOldestAt, initialMode, updatedAt: new Date() } },
      );
      job = { ...job, sourceFileIds, estimatedItems: sourceFileIds.length, estimatedBytes, sourceCursorAt, sourceOldestAt, initialMode };
    }

    const start = Math.max(0, Number(job.cursorIndex || 0));
    const ids = job.sourceFileIds.slice(start, start + SMART_SYNC_BATCH_SIZE);
    let usedBytes = await currentUsage(db, job.userId);
    const totals = { processed: 0, saved: 0, skipped: 0, failed: 0, bytes: 0 };
    let capacityReached = false;
    let maxModifiedAt = job.maxSourceModifiedAt ? new Date(job.maxSourceModifiedAt) : new Date(0);

    for (const driveId of ids) {
      const result = await importDriveFile({ db, token, user, driveId, usedBytes });
      if (result.modifiedAt && new Date(result.modifiedAt) > maxModifiedAt) maxModifiedAt = new Date(result.modifiedAt);
      if (result.status === 'capacity') {
        capacityReached = true;
        break;
      }
      totals.processed += 1;
      if (result.status === 'saved') {
        totals.saved += 1;
        totals.bytes += result.size;
        usedBytes += result.size;
      } else if (result.status === 'skipped') totals.skipped += 1;
      else totals.failed += 1;
    }

    const nextCursor = start + totals.processed;
    const finished = !capacityReached && nextCursor >= job.sourceFileIds.length;
    const update = {
      cursorIndex: nextCursor,
      processedItems: (Number(job.processedItems) || 0) + totals.processed,
      importedItems: (Number(job.importedItems) || 0) + totals.saved,
      skippedItems: (Number(job.skippedItems) || 0) + totals.skipped,
      failedItems: (Number(job.failedItems) || 0) + totals.failed,
      processedBytes: (Number(job.processedBytes) || 0) + totals.bytes,
      maxSourceModifiedAt: maxModifiedAt.getTime() ? maxModifiedAt : null,
      status: capacityReached ? 'paused' : finished ? 'completed' : 'queued',
      completionReason: capacityReached ? 'capacity_reached' : finished ? 'finished' : null,
      completedAt: finished ? new Date() : null,
      pauseRequested: capacityReached,
      updatedAt: new Date(),
      lastError: null,
    };
    await releaseLease(db, job, update, finished ? { activeKey: '' } : {});

    if (finished && maxModifiedAt.getTime()) {
      const set = { lastAutoSyncAt: new Date(), updatedAt: new Date() };
      if (job.initialMode) {
        set.smartSyncInitialBeforeAt = job.sourceOldestAt || maxModifiedAt;
        const currentNewest = connection.smartSyncInitialNewestAt ? new Date(connection.smartSyncInitialNewestAt) : new Date(0);
        set.smartSyncInitialNewestAt = maxModifiedAt > currentNewest ? maxModifiedAt : currentNewest;
      } else {
        set.smartSyncCursorAt = maxModifiedAt;
      }
      await db.collection('cloud_connections').updateOne({ _id: connection._id }, { $set: set });
    }

    return { claimed: true, completed: finished, capacityReached, totals };
  } catch (error) {
    await releaseLease(
      db,
      job,
      terminalJobPatch('failed', { lastError: String(error?.message || 'Smart Sync failed.').slice(0, 500) }),
      {},
    );
    return { claimed: true, failed: true, error: error?.message || 'Smart Sync failed.' };
  }
}

export async function ensureGoogleDriveAutomaticJob({ db, connection }) {
  const profile = await db.collection('smart_sync_profiles').findOne({
    userId: connection.userId,
    providerId: 'google_drive',
    enabled: true,
    approvedAt: { $ne: null },
  });
  if (!profile) return null;

  const activeKey = `${connection.userId}:google_drive`;
  const existing = await db.collection('smart_sync_jobs').findOne({ activeKey });
  if (existing) return existing;

  const job = { id: uuidv4(), ...createSmartSyncJob({ userId: connection.userId, providerId: 'google_drive', profile, mode: 'automatic' }) };
  try {
    await db.collection('smart_sync_jobs').createIndex({ activeKey: 1 }, { unique: true, sparse: true });
    await db.collection('smart_sync_jobs').insertOne(job);
    return job;
  } catch (error) {
    if (error?.code === 11000) return db.collection('smart_sync_jobs').findOne({ activeKey });
    throw error;
  }
}
