import { v4 as uuidv4 } from 'uuid';
import { createSmartSyncJob, SMART_SYNC_BATCH_SIZE, terminalJobPatch } from '@/lib/smart-sync/jobs';
import {
  ensureCloudAssetIndexes,
  mergeSyncMetrics,
  metricsIncrementPatch,
  normalizeSyncMetrics,
} from '@/lib/smart-sync/cloud-assets';
import {
  freshGoogleDriveAccessToken,
  getDriveStartPageToken,
  listDriveChangePage,
  listDriveInitialPage,
} from '@/lib/smart-sync/google-drive-api';
import {
  currentCloudUsage,
  importGoogleDriveAsset,
  inventoryGoogleDriveAssets,
  markRemovedDriveAsset,
} from '@/lib/smart-sync/google-drive-importer';

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
    return ['recent', 'everything', 'manual'].includes(rule.type);
  });
  return index >= 0 ? index : 999;
}

async function updateConnectionMetrics(db, connection, metrics, extraSet = {}, extraUnset = {}) {
  const increment = metricsIncrementPatch(metrics);
  const update = {
    $set: {
      ...extraSet,
      lastSyncMetrics: normalizeSyncMetrics(metrics),
      updatedAt: new Date(),
    },
  };
  if (Object.keys(increment).length) update.$inc = increment;
  if (Object.keys(extraUnset).length) update.$unset = extraUnset;
  await db.collection('cloud_connections').updateOne({ _id: connection._id }, update);
}

async function discoverPage({ db, token, connection, job }) {
  const metrics = normalizeSyncMetrics();
  const initialMode = !connection.smartSyncInitialCompleted || !connection.driveChangePageToken;

  if (initialMode && !connection.driveInitialStartPageToken) {
    const startPageToken = await getDriveStartPageToken(token);
    metrics.providerApiCalls += 1;
    connection.driveInitialStartPageToken = startPageToken;
    await db.collection('cloud_connections').updateOne(
      { _id: connection._id },
      { $set: { driveInitialStartPageToken: startPageToken, smartSyncInitialCompleted: false, updatedAt: new Date() } },
    );
  }

  if (initialMode) {
    const page = await listDriveInitialPage(token, {
      pageToken: job.discoveryPageToken || '',
      rules: enabledRules(job),
      rank: ruleRank,
    });
    metrics.providerApiCalls += 1;
    metrics.discoveredItems += page.items.length;
    metrics.metadataUpserts += page.items.length;
    const inventory = await inventoryGoogleDriveAssets({
      db,
      userId: job.userId,
      jobId: job.id,
      items: page.items,
    });
    metrics.unsupportedItems += inventory.unsupported;
    return {
      initialMode: true,
      sourceFileIds: inventory.importable,
      automaticallySkipped: inventory.safeExisting + inventory.unsupported,
      nextPageToken: page.nextPageToken,
      newStartPageToken: null,
      metrics,
    };
  }

  const page = await listDriveChangePage(token, job.discoveryPageToken || connection.driveChangePageToken);
  metrics.providerApiCalls += 1;
  metrics.discoveredItems += page.changes.length;
  const changedItems = [];

  for (const change of page.changes) {
    if (change.removed || !change.file || change.file.trashed) {
      await markRemovedDriveAsset({ db, userId: job.userId, jobId: job.id, change });
      metrics.metadataUpserts += 1;
      metrics.removedItems += 1;
    } else {
      changedItems.push(change.file);
    }
  }

  metrics.metadataUpserts += changedItems.length;
  const inventory = await inventoryGoogleDriveAssets({
    db,
    userId: job.userId,
    jobId: job.id,
    items: changedItems,
  });
  metrics.unsupportedItems += inventory.unsupported;
  return {
    initialMode: false,
    sourceFileIds: inventory.importable,
    automaticallySkipped: inventory.safeExisting + inventory.unsupported + metrics.removedItems,
    nextPageToken: page.nextPageToken,
    newStartPageToken: page.newStartPageToken,
    metrics,
  };
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

function discoveryPatch(job, discovery) {
  return {
    sourceFileIds: discovery.sourceFileIds,
    cursorIndex: 0,
    initialMode: discovery.initialMode,
    discoveryPageToken: job.discoveryPageToken || null,
    pendingPageToken: discovery.nextPageToken || null,
    pendingNewStartPageToken: discovery.newStartPageToken || null,
    estimatedItems: (Number(job.estimatedItems) || 0) + discovery.sourceFileIds.length + discovery.automaticallySkipped,
    processedItems: (Number(job.processedItems) || 0) + discovery.automaticallySkipped,
    skippedItems: (Number(job.skippedItems) || 0) + discovery.automaticallySkipped,
    metrics: mergeSyncMetrics(job.metrics, discovery.metrics),
    updatedAt: new Date(),
  };
}

async function completeDiscoveryWithoutImports({ db, job, connection, discovery }) {
  if (discovery.nextPageToken) {
    await releaseLease(db, job, {
      ...discoveryPatch(job, discovery),
      sourceFileIds: [],
      discoveryPageToken: discovery.nextPageToken,
      pendingPageToken: null,
      pendingNewStartPageToken: discovery.newStartPageToken || null,
      status: 'queued',
    });
    await updateConnectionMetrics(db, connection, discovery.metrics, { lastAutoSyncAt: new Date() });
    return { claimed: true, completed: false, advancedCursor: true };
  }

  const connectionSet = { lastAutoSyncAt: new Date() };
  const connectionUnset = {};
  if (discovery.initialMode) {
    connectionSet.smartSyncInitialCompleted = true;
    connectionSet.driveChangePageToken = connection.driveInitialStartPageToken;
    connectionUnset.driveInitialStartPageToken = '';
  } else if (discovery.newStartPageToken) {
    connectionSet.driveChangePageToken = discovery.newStartPageToken;
  }

  await releaseLease(
    db,
    job,
    terminalJobPatch('completed', {
      completionReason: 'no_changes',
      metrics: mergeSyncMetrics(job.metrics, discovery.metrics),
      estimatedItems: (Number(job.estimatedItems) || 0) + discovery.automaticallySkipped,
      processedItems: (Number(job.processedItems) || 0) + discovery.automaticallySkipped,
      skippedItems: (Number(job.skippedItems) || 0) + discovery.automaticallySkipped,
      sourceFileIds: [],
      cursorIndex: 0,
      discoveryPageToken: null,
      pendingPageToken: null,
      pendingNewStartPageToken: null,
    }),
    { activeKey: '' },
  );
  await updateConnectionMetrics(db, connection, discovery.metrics, connectionSet, connectionUnset);
  return { claimed: true, completed: true, reason: 'no_changes' };
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

    await ensureCloudAssetIndexes(db);
    const token = await freshGoogleDriveAccessToken(db, connection);
    if (!Array.isArray(job.sourceFileIds) || !job.sourceFileIds.length) {
      const discovery = await discoverPage({ db, token, connection, job });
      if (!discovery.sourceFileIds.length) {
        return completeDiscoveryWithoutImports({ db, job, connection, discovery });
      }
      const patch = discoveryPatch(job, discovery);
      await db.collection('smart_sync_jobs').updateOne(
        { id: job.id, userId: job.userId, leaseToken: job.leaseToken },
        { $set: patch },
      );
      await updateConnectionMetrics(db, connection, discovery.metrics, { lastAutoSyncAt: new Date() });
      job = { ...job, ...patch };
    }

    const start = Math.max(0, Number(job.cursorIndex || 0));
    const ids = job.sourceFileIds.slice(start, start + SMART_SYNC_BATCH_SIZE);
    let usedBytes = await currentCloudUsage(db, job.userId);
    const totals = { processed: 0, saved: 0, skipped: 0, failed: 0, bytes: 0 };
    let batchMetrics = normalizeSyncMetrics();
    let capacityReached = false;

    for (const driveId of ids) {
      const result = await importGoogleDriveAsset({ db, token, user, driveId, usedBytes, jobId: job.id });
      batchMetrics = mergeSyncMetrics(batchMetrics, result.metrics);
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
    const sourceBatchFinished = !capacityReached && nextCursor >= job.sourceFileIds.length;
    const hasMoreDiscovery = sourceBatchFinished && Boolean(job.pendingPageToken);
    const finished = sourceBatchFinished && !job.pendingPageToken;
    const metrics = mergeSyncMetrics(job.metrics, batchMetrics);
    const update = {
      cursorIndex: hasMoreDiscovery || finished ? 0 : nextCursor,
      sourceFileIds: hasMoreDiscovery || finished ? [] : job.sourceFileIds,
      discoveryPageToken: finished ? null : hasMoreDiscovery ? job.pendingPageToken : job.discoveryPageToken || null,
      pendingPageToken: finished || hasMoreDiscovery ? null : job.pendingPageToken || null,
      pendingNewStartPageToken: finished ? null : job.pendingNewStartPageToken || null,
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

    const connectionSet = { lastAutoSyncAt: new Date() };
    const connectionUnset = {};
    if (finished) {
      if (job.initialMode) {
        connectionSet.smartSyncInitialCompleted = true;
        connectionSet.driveChangePageToken = connection.driveInitialStartPageToken;
        connectionUnset.driveInitialStartPageToken = '';
      } else if (job.pendingNewStartPageToken) {
        connectionSet.driveChangePageToken = job.pendingNewStartPageToken;
      }
    }
    await updateConnectionMetrics(db, connection, batchMetrics, connectionSet, connectionUnset);
    return { claimed: true, completed: finished, capacityReached, totals, metrics: batchMetrics };
  } catch (error) {
    const message = String(error?.message || 'Smart Sync failed.').slice(0, 500);
    await releaseLease(db, job, terminalJobPatch('failed', { lastError: message }));
    return { claimed: true, failed: true, error: message };
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

  const job = {
    id: uuidv4(),
    ...createSmartSyncJob({
      userId: connection.userId,
      providerId: 'google_drive',
      profile,
      mode: 'automatic',
    }),
  };
  try {
    await db.collection('smart_sync_jobs').createIndex({ activeKey: 1 }, { unique: true, sparse: true });
    await ensureCloudAssetIndexes(db);
    await db.collection('smart_sync_jobs').insertOne(job);
    return job;
  } catch (error) {
    if (error?.code === 11000) return db.collection('smart_sync_jobs').findOne({ activeKey });
    throw error;
  }
}
