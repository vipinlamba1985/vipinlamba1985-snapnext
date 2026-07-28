import { v4 as uuidv4 } from 'uuid';
import { createSmartSyncJob, SMART_SYNC_BATCH_SIZE, terminalJobPatch } from '@/lib/smart-sync/jobs';
import {
  ensureCloudAssetIndexes,
  mergeSyncMetrics,
  metricsIncrementPatch,
  normalizeSyncMetrics,
} from '@/lib/smart-sync/cloud-assets';
import {
  freshProviderAccessToken,
  listDropboxPage,
  listOneDrivePage,
} from '@/lib/smart-sync/provider-api';
import {
  currentCloudUsage,
  importCloudProviderAsset,
  inventoryCloudProviderAssets,
} from '@/lib/smart-sync/provider-importer';
import { normalizeSmartSyncMode, selectCloudProtection } from '@/lib/smart-sync/selection';

const LEASE_MS = 4 * 60 * 1000;
const AUTOMATIC_PROVIDERS = ['dropbox', 'onedrive'];
const CURSOR_FIELDS = { dropbox: 'dropboxCursor', onedrive: 'oneDriveDeltaLink' };

function providerName(provider) {
  return provider === 'onedrive' ? 'OneDrive' : provider === 'google_photos' ? 'Google Photos' : provider === 'dropbox' ? 'Dropbox' : provider;
}

function enabledRules(job = {}) {
  return (Array.isArray(job.rules) ? job.rules : [])
    .filter(rule => rule?.enabled !== false)
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0));
}

async function updateConnectionMetrics(db, connection, metrics, extraSet = {}) {
  const increment = metricsIncrementPatch(metrics);
  const update = {
    $set: {
      ...extraSet,
      lastSyncMetrics: normalizeSyncMetrics(metrics),
      updatedAt: new Date(),
    },
  };
  if (Object.keys(increment).length) update.$inc = increment;
  await db.collection('cloud_connections').updateOne({ _id: connection._id }, update);
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

async function discoverProviderPage({ db, token, connection, job }) {
  const provider = job.providerId;
  const metrics = normalizeSyncMetrics();
  const cursorField = CURSOR_FIELDS[provider];
  const connectionCursor = connection[cursorField] || null;
  const initialMode = !connectionCursor;
  let rawItems = [];
  let nextPageToken = null;
  let newStartPageToken = null;

  if (provider === 'dropbox') {
    const page = await listDropboxPage(token, job.discoveryPageToken || connectionCursor || null);
    rawItems = page.entries;
    nextPageToken = page.hasMore ? page.cursor : null;
    newStartPageToken = page.hasMore ? null : page.cursor;
  } else if (provider === 'onedrive') {
    const page = await listOneDrivePage(token, job.discoveryPageToken || connectionCursor || null);
    rawItems = page.entries;
    nextPageToken = page.nextLink;
    newStartPageToken = page.deltaLink;
  } else {
    throw new Error('This provider does not support automatic discovery.');
  }

  metrics.providerApiCalls += 1;
  metrics.discoveredItems += rawItems.length;
  metrics.metadataUpserts += rawItems.length;
  const inventory = await inventoryCloudProviderAssets({
    db,
    userId: job.userId,
    provider,
    jobId: job.id,
    items: rawItems,
  });
  metrics.unsupportedItems += inventory.unsupported;
  metrics.removedItems += inventory.removed;

  const selection = selectCloudProtection({
    items: inventory.normalizedItems,
    importableIds: inventory.importable,
    syncMode: job.syncMode,
    rules: enabledRules(job),
  });
  metrics.indexedItems += selection.indexedItems;
  return {
    initialMode,
    sourceFileIds: selection.sourceFileIds,
    indexedOnlyItems: selection.indexedOnlyItems,
    indexedItems: selection.indexedItems,
    automaticallySkipped: inventory.safeExisting + inventory.unsupported + inventory.removed,
    nextPageToken,
    newStartPageToken,
    metrics,
  };
}

function discoveryPatch(job, discovery) {
  const discoveredItems = discovery.sourceFileIds.length + discovery.indexedOnlyItems + discovery.automaticallySkipped;
  return {
    sourceFileIds: discovery.sourceFileIds,
    cursorIndex: 0,
    initialMode: discovery.initialMode,
    discoveryPageToken: job.discoveryPageToken || null,
    pendingPageToken: discovery.nextPageToken || null,
    pendingNewStartPageToken: discovery.newStartPageToken || null,
    estimatedItems: (Number(job.estimatedItems) || 0) + discoveredItems,
    processedItems: (Number(job.processedItems) || 0) + discovery.indexedOnlyItems + discovery.automaticallySkipped,
    indexedItems: (Number(job.indexedItems) || 0) + discovery.indexedItems,
    skippedItems: (Number(job.skippedItems) || 0) + discovery.automaticallySkipped,
    metrics: mergeSyncMetrics(job.metrics, discovery.metrics),
    updatedAt: new Date(),
  };
}

function completionReason(job, importedItems = Number(job.importedItems || 0)) {
  const mode = normalizeSmartSyncMode(job.syncMode);
  if (mode === 'index_only') return 'indexed';
  if (mode === 'protect_important') return importedItems > 0 ? 'protected_important' : 'no_priority_matches';
  return 'finished';
}

async function completeDiscoveryWithoutImports({ db, job, connection, discovery }) {
  const patch = discoveryPatch(job, discovery);
  if (discovery.nextPageToken) {
    await releaseLease(db, job, {
      ...patch,
      sourceFileIds: [],
      discoveryPageToken: discovery.nextPageToken,
      pendingPageToken: null,
      pendingNewStartPageToken: discovery.newStartPageToken || null,
      status: 'queued',
    });
    await updateConnectionMetrics(db, connection, discovery.metrics, { lastAutoSyncAt: new Date(), smartSyncMode: normalizeSmartSyncMode(job.syncMode) });
    return { claimed: true, completed: false, advancedCursor: true };
  }

  const cursorField = CURSOR_FIELDS[job.providerId];
  const connectionSet = {
    lastAutoSyncAt: new Date(),
    smartSyncMode: normalizeSmartSyncMode(job.syncMode),
    smartSyncInitialCompleted: true,
    ...(discovery.newStartPageToken ? { [cursorField]: discovery.newStartPageToken } : {}),
  };
  const reason = discovery.metrics.discoveredItems || patch.indexedItems ? completionReason(job) : 'no_changes';
  await releaseLease(db, job, terminalJobPatch('completed', {
    ...patch,
    completionReason: reason,
    sourceFileIds: [],
    cursorIndex: 0,
    discoveryPageToken: null,
    pendingPageToken: null,
    pendingNewStartPageToken: null,
  }), { activeKey: '' });
  await updateConnectionMetrics(db, connection, discovery.metrics, connectionSet);
  return { claimed: true, completed: true, reason };
}

async function completePickerIndexOnly({ db, job, connection }) {
  const reason = completionReason(job);
  await releaseLease(db, job, terminalJobPatch('completed', {
    completionReason: reason,
    sourceFileIds: [],
    cursorIndex: 0,
  }), { activeKey: '' });
  await updateConnectionMetrics(db, connection, normalizeSyncMetrics(), { lastAutoSyncAt: new Date(), smartSyncMode: normalizeSmartSyncMode(job.syncMode) });
  return { claimed: true, completed: true, reason };
}

export async function processProviderJobBatch({ db, jobId, userId = null }) {
  let job = await claimJob(db, jobId, userId);
  if (!job) return { claimed: false };

  try {
    const provider = job.providerId;
    if (!['dropbox', 'onedrive', 'google_photos'].includes(provider)) throw new Error('This provider worker is unavailable.');
    const [user, connection, profile] = await Promise.all([
      db.collection('users').findOne({ id: job.userId }),
      db.collection('cloud_connections').findOne({ userId: job.userId, provider }),
      db.collection('smart_sync_profiles').findOne({ userId: job.userId }),
    ]);
    if (!user) throw new Error('User account not found.');
    if (!connection) throw new Error(`Reconnect ${providerName(provider)}.`);
    if (!profile?.approvedAt || !profile.enabled || profile.providerId !== provider) {
      throw new Error(`Smart Sync is not approved and active for ${providerName(provider)}.`);
    }

    await ensureCloudAssetIndexes(db);
    const token = await freshProviderAccessToken(db, connection);

    if ((!Array.isArray(job.sourceFileIds) || !job.sourceFileIds.length) && provider === 'google_photos') {
      return completePickerIndexOnly({ db, job, connection });
    }

    if (!Array.isArray(job.sourceFileIds) || !job.sourceFileIds.length) {
      const discovery = await discoverProviderPage({ db, token, connection, job });
      if (!discovery.sourceFileIds.length) return completeDiscoveryWithoutImports({ db, job, connection, discovery });
      const patch = discoveryPatch(job, discovery);
      await db.collection('smart_sync_jobs').updateOne(
        { id: job.id, userId: job.userId, leaseToken: job.leaseToken },
        { $set: patch },
      );
      await updateConnectionMetrics(db, connection, discovery.metrics, { lastAutoSyncAt: new Date(), smartSyncMode: normalizeSmartSyncMode(job.syncMode) });
      job = { ...job, ...patch };
    }

    const start = Math.max(0, Number(job.cursorIndex || 0));
    const ids = job.sourceFileIds.slice(start, start + SMART_SYNC_BATCH_SIZE);
    let usedBytes = await currentCloudUsage(db, job.userId);
    const totals = { processed: 0, saved: 0, skipped: 0, failed: 0, bytes: 0 };
    let batchMetrics = normalizeSyncMetrics();
    let capacityReached = false;

    for (const providerFileId of ids) {
      const result = await importCloudProviderAsset({ db, provider, token, user, providerFileId, usedBytes, jobId: job.id });
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
    const hasMoreDiscovery = provider !== 'google_photos' && sourceBatchFinished && Boolean(job.pendingPageToken);
    const finished = sourceBatchFinished && !job.pendingPageToken;
    const metrics = mergeSyncMetrics(job.metrics, batchMetrics);
    const importedItems = (Number(job.importedItems) || 0) + totals.saved;
    const update = {
      cursorIndex: hasMoreDiscovery || finished ? 0 : nextCursor,
      sourceFileIds: hasMoreDiscovery || finished ? [] : job.sourceFileIds,
      discoveryPageToken: finished ? null : hasMoreDiscovery ? job.pendingPageToken : job.discoveryPageToken || null,
      pendingPageToken: finished || hasMoreDiscovery ? null : job.pendingPageToken || null,
      pendingNewStartPageToken: finished ? null : job.pendingNewStartPageToken || null,
      processedItems: (Number(job.processedItems) || 0) + totals.processed,
      importedItems,
      skippedItems: (Number(job.skippedItems) || 0) + totals.skipped,
      failedItems: (Number(job.failedItems) || 0) + totals.failed,
      processedBytes: (Number(job.processedBytes) || 0) + totals.bytes,
      metrics,
      status: capacityReached ? 'paused' : finished ? 'completed' : 'queued',
      completionReason: capacityReached ? 'capacity_reached' : finished ? completionReason(job, importedItems) : null,
      completedAt: finished ? new Date() : null,
      pauseRequested: capacityReached,
      updatedAt: new Date(),
      lastError: null,
    };
    await releaseLease(db, job, update, finished ? { activeKey: '' } : {});

    const connectionSet = { lastAutoSyncAt: new Date(), smartSyncMode: normalizeSmartSyncMode(job.syncMode) };
    if (finished && provider !== 'google_photos') {
      const cursorField = CURSOR_FIELDS[provider];
      connectionSet.smartSyncInitialCompleted = true;
      if (job.pendingNewStartPageToken) connectionSet[cursorField] = job.pendingNewStartPageToken;
    }
    await updateConnectionMetrics(db, connection, batchMetrics, connectionSet);
    return { claimed: true, completed: finished, capacityReached, totals, metrics: batchMetrics };
  } catch (error) {
    const message = String(error?.message || 'Smart Sync failed.').slice(0, 500);
    await releaseLease(db, job, terminalJobPatch('failed', { lastError: message }));
    return { claimed: true, failed: true, error: message };
  }
}

export async function ensureProviderAutomaticJob({ db, connection }) {
  const provider = connection?.provider;
  if (!AUTOMATIC_PROVIDERS.includes(provider)) return null;
  const profile = await db.collection('smart_sync_profiles').findOne({
    userId: connection.userId,
    providerId: provider,
    enabled: true,
    approvedAt: { $ne: null },
  });
  if (!profile) return null;

  const activeKey = `${connection.userId}:${provider}`;
  const existing = await db.collection('smart_sync_jobs').findOne({ activeKey });
  if (existing) return existing;
  const job = {
    id: uuidv4(),
    ...createSmartSyncJob({ userId: connection.userId, providerId: provider, profile, mode: 'automatic' }),
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
