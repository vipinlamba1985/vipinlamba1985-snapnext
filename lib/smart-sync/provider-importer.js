import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '@/lib/storage';
import { entitlementForUser } from '@/lib/entitlements';
import {
  CLOUD_ASSET_STATES,
  normalizeSyncMetrics,
  upsertCloudAsset,
  markCloudAsset,
} from '@/lib/smart-sync/cloud-assets';
import {
  downloadDropboxFile,
  downloadGooglePhotosFile,
  downloadOneDriveFile,
  normalizeDropboxEntry,
  normalizeGooglePhotosItem,
  normalizeOneDriveEntry,
} from '@/lib/smart-sync/provider-api';
import { currentCloudUsage } from '@/lib/smart-sync/google-drive-importer';

const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export function normalizeProviderItem(provider, item = {}) {
  if (provider === 'dropbox') return normalizeDropboxEntry(item);
  if (provider === 'onedrive') return normalizeOneDriveEntry(item);
  if (provider === 'google_photos') return normalizeGooglePhotosItem(item);
  return null;
}

function sameProviderVersion(existing, asset) {
  return Boolean(existing && (
    (asset.providerVersion && existing.cloudSource?.providerVersion === asset.providerVersion)
    || (
      asset.providerChecksum?.value
      && existing.cloudSource?.providerChecksum?.algorithm === asset.providerChecksum.algorithm
      && existing.cloudSource?.providerChecksum?.value === asset.providerChecksum.value
    )
  ));
}

function assetExtra(asset = {}) {
  return {
    ...(asset.providerPath ? { providerPath: asset.providerPath } : {}),
    ...(asset.downloadUrl ? { downloadUrl: asset.downloadUrl } : {}),
    ...(asset.downloadExpiresAt ? { downloadExpiresAt: asset.downloadExpiresAt } : {}),
  };
}

export async function inventoryCloudProviderAssets({ db, userId, provider, jobId = null, items = [] }) {
  const normalizedItems = items.map(item => normalizeProviderItem(provider, item)).filter(Boolean);
  const active = normalizedItems.filter(item => item.sourceState !== 'removed' && item.id);
  const fileIds = active.map(item => item.id);
  const media = fileIds.length ? await db.collection('media').find({
    userId,
    'cloudSource.provider': provider,
    'cloudSource.fileId': { $in: fileIds },
  }).project({ id: 1, 'cloudSource.fileId': 1, 'cloudSource.providerVersion': 1, 'cloudSource.providerChecksum': 1 }).toArray() : [];
  const byFileId = new Map(media.map(item => [item.cloudSource?.fileId, item]));

  const importable = [];
  let safeExisting = 0;
  let unsupported = 0;
  let removed = 0;

  for (const asset of normalizedItems) {
    if (!asset.id) continue;
    if (asset.sourceState === 'removed') {
      const existingAsset = await db.collection('cloud_assets').findOne({ userId, provider, providerFileId: asset.id });
      await upsertCloudAsset({
        db,
        userId,
        provider,
        meta: asset,
        importState: existingAsset?.mediaId ? CLOUD_ASSET_STATES.SAFE : CLOUD_ASSET_STATES.REMOVED,
        jobId,
        extra: {
          sourceState: 'removed',
          removedAt: new Date(),
          ...(existingAsset?.mediaId ? { mediaId: existingAsset.mediaId, importOutcome: 'source_removed_after_import' } : {}),
        },
      });
      removed += 1;
      continue;
    }

    const existing = byFileId.get(asset.id);
    const sameVersion = sameProviderVersion(existing, asset);
    const importState = !asset.supported
      ? CLOUD_ASSET_STATES.UNSUPPORTED
      : sameVersion ? CLOUD_ASSET_STATES.SAFE : CLOUD_ASSET_STATES.AVAILABLE;
    await upsertCloudAsset({
      db,
      userId,
      provider,
      meta: asset,
      importState,
      jobId,
      extra: {
        ...assetExtra(asset),
        ...(sameVersion ? { mediaId: existing.id, importOutcome: 'already_imported' } : {}),
      },
    });
    if (!asset.supported) unsupported += 1;
    else if (sameVersion) safeExisting += 1;
    else importable.push(asset.id);
  }

  return { importable, safeExisting, unsupported, removed, normalizedItems: active };
}

async function downloadProviderAsset(provider, token, asset) {
  if (provider === 'dropbox') return downloadDropboxFile(token, asset.providerPath || asset.providerFileId);
  if (provider === 'onedrive') return downloadOneDriveFile(token, asset.providerFileId, asset.downloadUrl || null);
  if (provider === 'google_photos') return downloadGooglePhotosFile(token, asset);
  throw new Error('This cloud provider does not have an import worker.');
}

export async function importCloudProviderAsset({ db, provider, token, user, providerFileId, usedBytes, jobId = null }) {
  const asset = await db.collection('cloud_assets').findOne({
    userId: user.id,
    provider,
    providerFileId: String(providerFileId),
  });
  const metrics = normalizeSyncMetrics();
  const modifiedAt = asset?.modifiedAt || asset?.createdAt || null;

  if (!asset) return { status: 'failed', size: 0, modifiedAt, message: 'Cloud item metadata is unavailable.', metrics };
  if (!asset.supported || (!asset.mime?.startsWith('image/') && !asset.mime?.startsWith('video/'))) {
    await markCloudAsset({ db, userId: user.id, provider, providerFileId, importState: CLOUD_ASSET_STATES.UNSUPPORTED, patch: { lastError: 'Unsupported file type.' } });
    metrics.unsupportedItems += 1;
    return { status: 'failed', size: 0, modifiedAt, message: 'Unsupported cloud item.', metrics };
  }

  const declaredSize = Number(asset.size || 0);
  if (declaredSize > MAX_IMPORT_BYTES) {
    await markCloudAsset({ db, userId: user.id, provider, providerFileId, importState: CLOUD_ASSET_STATES.FAILED, patch: { lastError: 'File is too large for cloud import.' } });
    return { status: 'failed', size: 0, modifiedAt, message: 'File is too large for cloud import.', metrics };
  }

  const sourceDuplicate = await db.collection('media').findOne(
    { userId: user.id, 'cloudSource.provider': provider, 'cloudSource.fileId': String(providerFileId) },
    { sort: { createdAt: -1 } },
  );
  const sameSourceVersion = sameProviderVersion(sourceDuplicate, asset);
  if (sameSourceVersion) {
    await markCloudAsset({
      db,
      userId: user.id,
      provider,
      providerFileId,
      importState: CLOUD_ASSET_STATES.SAFE,
      patch: { mediaId: sourceDuplicate.id, importOutcome: 'already_imported', verifiedAt: new Date(), lastError: null },
    });
    return { status: 'skipped', size: 0, modifiedAt, reason: 'already_imported', metrics };
  }

  if (asset.providerChecksum?.value && declaredSize) {
    const duplicate = await db.collection('media').findOne({
      userId: user.id,
      size: declaredSize,
      'cloudSource.providerChecksum.algorithm': asset.providerChecksum.algorithm,
      'cloudSource.providerChecksum.value': asset.providerChecksum.value,
      trashed: { $ne: true },
    });
    if (duplicate) {
      metrics.providerChecksumSkips += 1;
      await markCloudAsset({
        db,
        userId: user.id,
        provider,
        providerFileId,
        importState: CLOUD_ASSET_STATES.SAFE,
        patch: { mediaId: duplicate.id, duplicateOfMediaId: duplicate.id, importOutcome: 'provider_checksum_duplicate', verifiedAt: new Date(), lastError: null },
      });
      return { status: 'skipped', size: 0, modifiedAt, reason: 'provider_checksum_duplicate', metrics };
    }
  }

  const entitlement = entitlementForUser(user);
  const limitBytes = entitlement.realIsSuper ? 0 : Number(entitlement.plan.storageBytes || 0);
  if (limitBytes && declaredSize && usedBytes + declaredSize > limitBytes) {
    metrics.capacityPreventedItems += 1;
    await markCloudAsset({ db, userId: user.id, provider, providerFileId, importState: CLOUD_ASSET_STATES.CAPACITY, patch: { lastError: 'Storage capacity reached.' } });
    return { status: 'capacity', size: 0, modifiedAt, message: 'Storage capacity reached.', metrics };
  }

  await markCloudAsset({ db, userId: user.id, provider, providerFileId, importState: CLOUD_ASSET_STATES.IMPORTING, patch: { importStartedAt: new Date(), lastError: null } });
  let response;
  try {
    response = await downloadProviderAsset(provider, token, asset);
  } catch (error) {
    await markCloudAsset({ db, userId: user.id, provider, providerFileId, importState: CLOUD_ASSET_STATES.FAILED, patch: { lastError: error.message || 'Cloud item could not be copied.' } });
    return { status: 'failed', size: 0, modifiedAt, message: error.message || 'Cloud item could not be copied.', metrics };
  }
  metrics.providerApiCalls += 1;
  if (!response.ok) {
    await markCloudAsset({ db, userId: user.id, provider, providerFileId, importState: CLOUD_ASSET_STATES.FAILED, patch: { lastError: 'Cloud item could not be copied.' } });
    return { status: 'failed', size: 0, modifiedAt, message: 'Cloud item could not be copied.', metrics };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  metrics.bytesDownloaded += buffer.length;
  if (!buffer.length || buffer.length > MAX_IMPORT_BYTES) {
    await markCloudAsset({ db, userId: user.id, provider, providerFileId, importState: CLOUD_ASSET_STATES.FAILED, patch: { lastError: 'Downloaded file is empty or too large.' } });
    return { status: 'failed', size: 0, modifiedAt, message: 'Downloaded file is empty or too large.', metrics };
  }
  if (limitBytes && usedBytes + buffer.length > limitBytes) {
    metrics.capacityPreventedItems += 1;
    await markCloudAsset({ db, userId: user.id, provider, providerFileId, importState: CLOUD_ASSET_STATES.CAPACITY, patch: { lastError: 'Storage capacity reached.' } });
    return { status: 'capacity', size: 0, modifiedAt, message: 'Storage capacity reached.', metrics };
  }

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const hashDuplicate = await db.collection('media').findOne({ userId: user.id, hash, trashed: { $ne: true } });
  if (hashDuplicate) {
    metrics.contentHashSkips += 1;
    await markCloudAsset({
      db,
      userId: user.id,
      provider,
      providerFileId,
      importState: CLOUD_ASSET_STATES.SAFE,
      patch: { mediaId: hashDuplicate.id, duplicateOfMediaId: hashDuplicate.id, importOutcome: 'sha256_duplicate', verifiedAt: new Date(), verificationHash: hash, lastError: null },
    });
    return { status: 'skipped', size: 0, modifiedAt, reason: 'sha256_duplicate', metrics };
  }

  const id = uuidv4();
  const saved = await storage.save({ userId: user.id, fileId: id, buffer, name: asset.name, mime: asset.mime });
  await db.collection('media').insertOne({
    id,
    userId: user.id,
    name: asset.name,
    size: buffer.length,
    hash,
    mime: asset.mime,
    kind: asset.mime.startsWith('video/') ? 'video' : 'photo',
    storageKey: saved.storageKey,
    provider: saved.provider,
    favorite: false,
    trashed: false,
    cloudSource: {
      provider,
      fileId: String(providerFileId),
      cloudAssetId: asset.id,
      providerChecksum: asset.providerChecksum || null,
      providerVersion: asset.providerVersion || null,
      importedAt: new Date(),
      smartSync: Boolean(jobId),
      ...(sourceDuplicate ? { supersedesMediaId: sourceDuplicate.id } : {}),
    },
    verification: { sha256: hash, verifiedAt: new Date() },
    aiAnalysis: { tags: [], faces: [], autoAlbum: 'Cloud Imports' },
    createdAt: asset.createdAt || new Date(),
  });
  metrics.bytesStored += buffer.length;
  await markCloudAsset({
    db,
    userId: user.id,
    provider,
    providerFileId,
    importState: CLOUD_ASSET_STATES.SAFE,
    patch: {
      mediaId: id,
      size: buffer.length,
      importOutcome: sourceDuplicate ? 'new_provider_version' : 'copied_and_verified',
      importedAt: new Date(),
      verifiedAt: new Date(),
      verificationHash: hash,
      lastError: null,
    },
  });
  return { status: 'saved', size: buffer.length, modifiedAt, mediaId: id, metrics };
}

export { currentCloudUsage };
