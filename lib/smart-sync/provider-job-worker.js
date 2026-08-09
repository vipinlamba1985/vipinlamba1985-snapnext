import { v4 as uuidv4 } from 'uuid';
import { SMART_SYNC_BATCH_SIZE, terminalJobPatch } from '@/lib/smart-sync/jobs';
import { ensureCloudAssetIndexes, mergeSyncMetrics, metricsIncrementPatch, normalizeSyncMetrics } from '@/lib/smart-sync/cloud-assets';
import { deleteGooglePhotosPickerSession, freshProviderAccessToken } from '@/lib/smart-sync/provider-api';
import { currentCloudUsage, importCloudProviderAsset } from '@/lib/smart-sync/provider-importer';

const LEASE_MS = 4 * 60 * 1000;

async function claimJob(db, jobId, userId) {
  const now = new Date();
  const leaseToken = uuidv4();
  const result = await db.collection('smart_sync_jobs').updateOne(
    { id: jobId, ...(userId ? { userId } : {}), status: { $in: ['queued', 'running'] }, pauseRequested: { $ne: true }, stopRequested: { $ne: true }, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
    { $set: { status: 'running', leaseToken, leaseUntil: new Date(Date.now() + LEASE_MS), startedAt: now, updatedAt: now } },
  );
  if (!result.modifiedCount) return null;
  return db.collection('smart_sync_jobs').findOne({ id: jobId, ...(userId ? { userId } : {}), leaseToken });
}

async function releaseLease(db, job, update, unset = {}) {
  await db.collection('smart_sync_jobs').updateOne({ id: job.id, userId: job.userId, leaseToken: job.leaseToken }, { $set: update, $unset: { leaseToken: '', leaseUntil: '', ...unset } });
}

async function cleanupPickerSession({ db, token, job }) {
  if (!job.pickerSessionId) return;
  try { await deleteGooglePhotosPickerSession(token, job.pickerSessionId); } catch {}
  await db.collection('smart_sync_picker_sessions').deleteOne({ userId: job.userId, provider: 'google_photos', sessionId: job.pickerSessionId }).catch(() => {});
}

async function updateConnectionMetrics(db, connection, metrics) {
  const increment = metricsIncrementPatch(metrics);
  const update = { $set: { lastImportAt: new Date(), lastSyncMetrics: normalizeSyncMetrics(metrics), updatedAt: new Date() } };
  if (Object.keys(increment).length) update.$inc = increment;
  await db.collection('cloud_connections').updateOne({ _id: connection._id }, update);
}

export async function processProviderJobBatch({ db, jobId, userId = null }) {
  const job = await claimJob(db, jobId, userId);
  if (!job) return { claimed: false };

  try {
    // Launch invariant: this worker only executes explicit Google Photos picker
    // selections. Dropbox/OneDrive background discovery remains retired.
    if (job.providerId !== 'google_photos' || job.mode !== 'manual_selection') {
      throw new Error('Background cloud sync is not enabled at launch. Start a user-selected Smart Import instead.');
    }

    const [user, connection] = await Promise.all([
      db.collection('users').findOne({ id: job.userId }),
      db.collection('cloud_connections').findOne({ userId: job.userId, provider: 'google_photos' }),
    ]);
    if (!user) throw new Error('User account not found.');
    if (!connection) throw new Error('Reconnect Google Photos.');

    await ensureCloudAssetIndexes(db);
    const token = await freshProviderAccessToken(db, connection);
    const sourceIds = Array.isArray(job.sourceFileIds) ? job.sourceFileIds : [];
    const start = Math.max(0, Number(job.cursorIndex || 0));

    if (!sourceIds.length || start >= sourceIds.length) {
      const update = terminalJobPatch('completed', { completionReason: 'finished', sourceFileIds: [], cursorIndex: 0 });
      await releaseLease(db, job, update, { activeKey: '' });
      await cleanupPickerSession({ db, token, job });
      return { claimed: true, completed: true, totals: { processed: 0, saved: 0, skipped: 0, failed: 0, bytes: 0 } };
    }

    const ids = sourceIds.slice(start, start + SMART_SYNC_BATCH_SIZE);
    let usedBytes = await currentCloudUsage(db, job.userId);
    const totals = { processed: 0, saved: 0, skipped: 0, failed: 0, bytes: 0 };
    let batchMetrics = normalizeSyncMetrics();
    let capacityReached = false;

    for (const providerFileId of ids) {
      const result = await importCloudProviderAsset({ db, provider: 'google_photos', token, user, providerFileId, usedBytes, jobId: job.id });
      batchMetrics = mergeSyncMetrics(batchMetrics, result.metrics);
      if (result.status === 'capacity') { capacityReached = true; break; }
      totals.processed += 1;
      if (result.status === 'saved') { totals.saved += 1; totals.bytes += result.size; usedBytes += result.size; }
      else if (result.status === 'skipped') totals.skipped += 1;
      else totals.failed += 1;
    }

    const nextCursor = start + totals.processed;
    const finished = !capacityReached && nextCursor >= sourceIds.length;
    const metrics = mergeSyncMetrics(job.metrics, batchMetrics);
    const update = {
      cursorIndex: finished ? 0 : nextCursor,
      sourceFileIds: finished ? [] : sourceIds,
      processedItems: (Number(job.processedItems) || 0) + totals.processed,
      importedItems: (Number(job.importedItems) || 0) + totals.saved,
      skippedItems: (Number(job.skippedItems) || 0) + totals.skipped,
      failedItems: (Number(job.failedItems) || 0) + totals.failed,
      processedBytes: (Number(job.processedBytes) || 0) + totals.bytes,
      metrics,
      status: capacityReached ? 'paused' : finished ? 'completed' : 'queued',
      completionReason: capacityReached ? 'capacity_reached' : finished ? 'finished' : null,
      completedAt: finished ? new Date() : null,
      pauseRequested: capacityReached,
      updatedAt: new Date(),
      lastError: null,
    };
    await releaseLease(db, job, update, finished ? { activeKey: '' } : {});
    await updateConnectionMetrics(db, connection, batchMetrics);
    if (finished) await cleanupPickerSession({ db, token, job });
    return { claimed: true, completed: finished, capacityReached, totals, metrics: batchMetrics };
  } catch (error) {
    const message = String(error?.message || 'Smart Import failed.').slice(0, 500);
    await releaseLease(db, job, terminalJobPatch('failed', { lastError: message }), { activeKey: '' });
    return { claimed: true, failed: true, error: message };
  }
}

export async function ensureProviderAutomaticJob() {
  // Auto Cloud Sync is deliberately not launch infrastructure.
  return null;
}
