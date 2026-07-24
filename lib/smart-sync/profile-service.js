import {
  DEFAULT_SMART_SYNC_PROFILE,
  normalizeSmartSyncProfile,
  SMART_SYNC_PROVIDERS,
} from '../smart-sync.js';
import { listProviderStatus } from './providers.js';
import { cloudInventorySnapshot, normalizeSyncMetrics } from './cloud-assets.js';
import { SmartSyncJobServiceError } from './job-service.js';

export function smartSyncPlanFingerprint(profile) {
  return JSON.stringify({
    providerId: profile.providerId,
    mode: profile.mode,
    rules: profile.rules,
    stopAtCapacity: profile.stopAtCapacity,
    notifyOnComplete: profile.notifyOnComplete,
  });
}

export function publicCloudAsset(asset = {}) {
  return {
    id: asset.id,
    provider: asset.provider,
    providerFileId: asset.providerFileId,
    name: asset.name,
    mime: asset.mime,
    kind: asset.kind,
    size: Number(asset.size || 0),
    createdAt: asset.createdAt || null,
    modifiedAt: asset.modifiedAt || null,
    importState: asset.importState || 'available_to_import',
    sourceState: asset.sourceState || 'active',
    importOutcome: asset.importOutcome || null,
    mediaId: asset.mediaId || null,
    lastError: asset.lastError || null,
  };
}

async function storageSnapshot(db, userId) {
  const [usage] = await db.collection('media').aggregate([
    { $match: { userId, trashed: { $ne: true } } },
    { $group: { _id: null, bytes: { $sum: '$size' }, items: { $sum: 1 } } },
  ]).toArray();
  return { usedBytes: usage?.bytes || 0, itemCount: usage?.items || 0 };
}

export async function getSmartSyncState({ db, userId }) {
  const saved = await db.collection('smart_sync_profiles').findOne({ userId });
  const profile = normalizeSmartSyncProfile(saved || DEFAULT_SMART_SYNC_PROFILE);
  const connections = await db.collection('cloud_connections').find({ userId }).project({
    provider: 1,
    connectedAt: 1,
    autoSyncEnabled: 1,
    lastAutoSyncAt: 1,
    lastAutoSyncError: 1,
    smartSyncInitialCompleted: 1,
    driveChangePageToken: 1,
    syncMetrics: 1,
    lastSyncMetrics: 1,
  }).toArray();
  const readiness = new Map(listProviderStatus().map(provider => [provider.id, provider]));
  const selectedConnection = connections.find(connection => connection.provider === profile.providerId) || null;
  const [storage, inventory, recentAssets] = await Promise.all([
    storageSnapshot(db, userId),
    cloudInventorySnapshot(db, userId, profile.providerId),
    db.collection('cloud_assets')
      .find({ userId, provider: profile.providerId })
      .sort({ modifiedAt: -1, updatedAt: -1 })
      .limit(8)
      .toArray(),
  ]);

  return {
    profile,
    providers: SMART_SYNC_PROVIDERS.map(provider => {
      const status = readiness.get(provider.id) || {};
      const connected = provider.surface === 'native'
        ? Boolean(saved?.nativeDevices?.some(device => device.provider === provider.id && device.authorized))
        : connections.some(connection => connection.provider === provider.id);
      return {
        ...provider,
        ...status,
        available: provider.surface === 'native' || Boolean(status.configured),
        connected,
      };
    }),
    storage,
    inventory,
    recentAssets: recentAssets.map(publicCloudAsset),
    operations: selectedConnection ? {
      provider: selectedConnection.provider,
      connectedAt: selectedConnection.connectedAt || null,
      lastAutoSyncAt: selectedConnection.lastAutoSyncAt || null,
      lastError: selectedConnection.lastAutoSyncError || null,
      initialDiscoveryComplete: Boolean(selectedConnection.smartSyncInitialCompleted),
      incrementalCursorReady: Boolean(selectedConnection.driveChangePageToken),
      totals: normalizeSyncMetrics(selectedConnection.syncMetrics),
      lastRun: normalizeSyncMetrics(selectedConnection.lastSyncMetrics),
    } : null,
    updatedAt: saved?.updatedAt || null,
  };
}

export async function saveSmartSyncProfile({ db, userId, body = {} }) {
  const profile = normalizeSmartSyncProfile(body.profile || body);
  const provider = SMART_SYNC_PROVIDERS.find(item => item.id === profile.providerId);
  const saved = await db.collection('smart_sync_profiles').findOne({ userId });

  if (profile.enabled && provider?.surface === 'web') {
    const connection = await db.collection('cloud_connections').findOne({ userId, provider: profile.providerId });
    if (!connection) {
      throw new SmartSyncJobServiceError(
        `Connect ${provider.name} before enabling Smart Sync.`,
        400,
        'provider_not_connected',
      );
    }
  }

  if (profile.enabled && provider?.surface === 'native') {
    const authorized = saved?.nativeDevices?.some(device => device.provider === profile.providerId && device.authorized);
    if (!authorized) {
      throw new SmartSyncJobServiceError(
        `Authorize ${provider.name} in the SnapNext mobile app first.`,
        400,
        'native_device_not_authorized',
      );
    }
  }

  const fingerprint = smartSyncPlanFingerprint(profile);
  const planChanged = saved?.planFingerprint && saved.planFingerprint !== fingerprint;
  const approvedAt = body.approved === true
    ? new Date()
    : planChanged
      ? null
      : saved?.approvedAt || null;

  if (profile.enabled && !approvedAt) {
    const error = new SmartSyncJobServiceError(
      'Review and approve the Smart Sync plan before turning it on.',
      400,
      'plan_approval_required',
    );
    error.requiresApproval = true;
    throw error;
  }

  await db.collection('smart_sync_profiles').updateOne(
    { userId },
    {
      $set: {
        ...profile,
        approvedAt,
        planFingerprint: fingerprint,
        userId,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date(), nativeDevices: [] },
    },
    { upsert: true },
  );

  if (provider?.surface === 'web') {
    await db.collection('cloud_connections').updateOne(
      { userId, provider: profile.providerId },
      {
        $set: {
          autoSyncEnabled: profile.enabled,
          smartSyncRules: profile.rules,
          smartSyncPriority: profile.rules.filter(rule => rule.enabled).map(rule => rule.type),
          updatedAt: new Date(),
        },
      },
    );
  }

  return { ok: true, profile: { ...profile, approvedAt } };
}
