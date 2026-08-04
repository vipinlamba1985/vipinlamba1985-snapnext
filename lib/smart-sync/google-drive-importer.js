import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { storage } from '@/lib/storage';
import { entitlementForUser } from '@/lib/entitlements';
import {
  CLOUD_ASSET_STATES,
  normalizeDriveAsset,
  normalizeSyncMetrics,
  upsertCloudAsset,
  markCloudAsset,
} from '@/lib/smart-sync/cloud-assets';
// The narrow read-only surface, not the general Drive client. drive.file
// permits writes, so the import path is given only the two operations it needs
// and no way to express a mutation.
import { readDriveContent, readDriveMetadata } from '@/lib/smart-sync/google-drive-read-only';
// Picker metadata arrives through the browser, so the server re-reads it from
// Drive and decides for itself what may be imported.
import { inspectDriveMetadata, rejectionMessage, verifyDownloadedBytes, verifyDownloadedContent } from '@/lib/smart-sync/drive-import-policy';

const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export async function currentCloudUsage(db, userId) {
  const [usage] = await db.collection('media').aggregate([
    { $match: { userId, trashed: { $ne: true } } },
    { $group: { _id: null, bytes: { $sum: '$size' } } },
  ]).toArray();
  return Number(usage?.bytes || 0);
}

export async function inventoryGoogleDriveAssets({ db, userId, jobId = null, items }) {
  const fileIds = items.map(item => item.id).filter(Boolean);
  const media = fileIds.length ? await db.collection('media').find({
    userId,
    'cloudSource.provider': 'google_drive',
    'cloudSource.fileId': { $in: fileIds },
  }).project({ id: 1, 'cloudSource.fileId': 1, 'cloudSource.providerVersion': 1, 'cloudSource.providerChecksum': 1 }).toArray() : [];
  const byFileId = new Map(media.map(item => [item.cloudSource?.fileId, item]));
  const importable = [];
  let safeExisting = 0;
  let unsupported = 0;

  for (const item of items) {
    const asset = normalizeDriveAsset(item);
    const existing = byFileId.get(item.id);
    const sameVersion = Boolean(existing && (
      (asset.providerVersion && existing.cloudSource?.providerVersion === asset.providerVersion)
      || (
        asset.providerChecksum?.value
        && existing.cloudSource?.providerChecksum?.algorithm === asset.providerChecksum.algorithm
        && existing.cloudSource?.providerChecksum?.value === asset.providerChecksum.value
      )
    ));
    const importState = !asset.supported
      ? CLOUD_ASSET_STATES.UNSUPPORTED
      : sameVersion ? CLOUD_ASSET_STATES.SAFE : CLOUD_ASSET_STATES.AVAILABLE;
    await upsertCloudAsset({
      db,
      userId,
      meta: item,
      importState,
      jobId,
      extra: sameVersion ? { mediaId: existing.id, importOutcome: 'already_imported' } : {},
    });
    if (!asset.supported) unsupported += 1;
    else if (sameVersion) safeExisting += 1;
    else importable.push(item.id);
  }
  return { importable, safeExisting, unsupported };
}

export async function markRemovedDriveAsset({ db, userId, jobId, change }) {
  const existing = await db.collection('cloud_assets').findOne({
    userId,
    provider: 'google_drive',
    providerFileId: change.fileId,
  });
  await upsertCloudAsset({
    db,
    userId,
    meta: change.file || { id: change.fileId, name: existing?.name || 'Removed Google Drive item', trashed: true },
    importState: existing?.mediaId ? CLOUD_ASSET_STATES.SAFE : CLOUD_ASSET_STATES.REMOVED,
    jobId,
    extra: {
      sourceState: 'removed',
      removedAt: new Date(),
      ...(existing?.mediaId ? { mediaId: existing.mediaId, importOutcome: 'source_removed_after_import' } : {}),
    },
  });
}

/**
 * Imports one picked Drive file.
 *
 * This runs inline, on the request that asked for it — Picker imports do not
 * enter the durable queue. That is why the legacy job guard in
 * google-drive-job-worker.js is enough today: the only rows it can find are
 * whole-Drive sync jobs from before the drive.file migration.
 *
 * IF PICKER IMPORTS ARE EVER MOVED INTO A BACKGROUND QUEUE, that guard will not
 * cover them. DriveRescopeRequiredError must then be classified in the runner
 * as terminal, non-retryable and user-action-required, or a job holding a
 * revoked credential will retry forever against Google. The cancellation guard
 * protects legacy sync jobs only, not future Picker jobs.
 */
export async function importGoogleDriveAsset({ db, token, user, driveId, resourceKey = '', usedBytes, jobId = null }) {
  let asset = await db.collection('cloud_assets').findOne({
    userId: user.id,
    provider: 'google_drive',
    providerFileId: driveId,
  });
  const metrics = normalizeSyncMetrics();

  // Read from Drive every time. A cached record was written from an earlier
  // response and cannot show that a file has since been trashed, replaced or
  // had its download permission withdrawn.
  const meta = await readDriveMetadata(token, driveId, resourceKey);
  metrics.providerApiCalls += 1;
  asset = await upsertCloudAsset({ db, userId: user.id, meta, jobId });

  const modifiedAt = asset.modifiedAt || asset.createdAt || null;
  const verdict = inspectDriveMetadata(meta);
  if (!verdict.ok) {
    const message = rejectionMessage(verdict.reason);
    await markCloudAsset({ db, userId: user.id, providerFileId: driveId, importState: CLOUD_ASSET_STATES.UNSUPPORTED, patch: { lastError: message } });
    metrics.unsupportedItems += 1;
    return { status: 'failed', size: 0, modifiedAt, message, reason: verdict.reason, metrics };
  }

  const size = verdict.size;
  if (!size || size > MAX_IMPORT_BYTES) {
    await markCloudAsset({ db, userId: user.id, providerFileId: driveId, importState: CLOUD_ASSET_STATES.FAILED, patch: { lastError: 'File is too large for cloud import.' } });
    return { status: 'failed', size: 0, modifiedAt, message: 'File is too large for cloud import.', metrics };
  }

  const sourceDuplicate = await db.collection('media').findOne(
    { userId: user.id, 'cloudSource.provider': 'google_drive', 'cloudSource.fileId': driveId },
    { sort: { createdAt: -1 } },
  );
  const sameSourceVersion = Boolean(sourceDuplicate && (
    (asset.providerVersion && sourceDuplicate.cloudSource?.providerVersion === asset.providerVersion)
    || (
      asset.providerChecksum?.value
      && sourceDuplicate.cloudSource?.providerChecksum?.algorithm === asset.providerChecksum.algorithm
      && sourceDuplicate.cloudSource?.providerChecksum?.value === asset.providerChecksum.value
    )
  ));
  if (sameSourceVersion) {
    await markCloudAsset({
      db,
      userId: user.id,
      providerFileId: driveId,
      importState: CLOUD_ASSET_STATES.SAFE,
      patch: { mediaId: sourceDuplicate.id, importOutcome: 'already_imported', verifiedAt: new Date(), lastError: null },
    });
    return { status: 'skipped', size: 0, modifiedAt, reason: 'already_imported', metrics };
  }

  if (asset.providerChecksum?.value) {
    const duplicate = await db.collection('media').findOne({
      userId: user.id,
      size,
      'cloudSource.providerChecksum.algorithm': asset.providerChecksum.algorithm,
      'cloudSource.providerChecksum.value': asset.providerChecksum.value,
      trashed: { $ne: true },
    });
    if (duplicate) {
      metrics.providerChecksumSkips += 1;
      await markCloudAsset({
        db,
        userId: user.id,
        providerFileId: driveId,
        importState: CLOUD_ASSET_STATES.SAFE,
        patch: { mediaId: duplicate.id, duplicateOfMediaId: duplicate.id, importOutcome: 'provider_checksum_duplicate', verifiedAt: new Date(), lastError: null },
      });
      return { status: 'skipped', size: 0, modifiedAt, reason: 'provider_checksum_duplicate', metrics };
    }
  }

  const entitlement = entitlementForUser(user);
  const limitBytes = entitlement.realIsSuper ? 0 : Number(entitlement.plan.storageBytes || 0);
  if (limitBytes && usedBytes + size > limitBytes) {
    metrics.capacityPreventedItems += 1;
    await markCloudAsset({ db, userId: user.id, providerFileId: driveId, importState: CLOUD_ASSET_STATES.CAPACITY, patch: { lastError: 'Storage capacity reached.' } });
    return { status: 'capacity', size: 0, modifiedAt, message: 'Storage capacity reached.', metrics };
  }

  await markCloudAsset({ db, userId: user.id, providerFileId: driveId, importState: CLOUD_ASSET_STATES.IMPORTING, patch: { importStartedAt: new Date(), lastError: null } });
  const response = await readDriveContent(token, driveId, resourceKey);
  metrics.providerApiCalls += 1;
  if (!response.ok) {
    await markCloudAsset({ db, userId: user.id, providerFileId: driveId, importState: CLOUD_ASSET_STATES.FAILED, patch: { lastError: 'Drive item could not be copied.' } });
    return { status: 'failed', size: 0, modifiedAt, message: 'Drive item could not be copied.', metrics };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  metrics.bytesDownloaded += buffer.length;

  // What arrived decides, not what was promised. A file can change between the
  // metadata read and the download, so an oversized or altered stream is
  // refused here rather than written to storage.
  const delivered = verifyDownloadedBytes({
    expectedSize: size,
    actualSize: buffer.length,
    remainingQuota: limitBytes ? Math.max(0, limitBytes - usedBytes) : null,
  });
  if (!delivered.ok) {
    const message = rejectionMessage(delivered.reason);
    await markCloudAsset({ db, userId: user.id, providerFileId: driveId, importState: CLOUD_ASSET_STATES.FAILED, patch: { lastError: message } });
    return { status: 'failed', size: 0, modifiedAt, message, reason: delivered.reason, metrics };
  }

  // Every declared type so far came from something that can be wrong or lied
  // to. The bytes cannot, so they decide what this actually is — and Google's
  // own checksum is compared when it supplied one, which catches a same-length
  // replacement that a byte count would miss.
  const content = verifyDownloadedContent({
    bytes: buffer,
    expectedMd5: verdict.md5,
    actualMd5: verdict.md5 ? crypto.createHash('md5').update(buffer).digest('hex') : null,
  });
  if (!content.ok) {
    const message = content.reason === 'checksum_mismatch'
      ? 'This file changed in Google Drive while it was being copied.'
      : 'This file is not a photo or video SnapNext can read.';
    await markCloudAsset({ db, userId: user.id, providerFileId: driveId, importState: CLOUD_ASSET_STATES.UNSUPPORTED, patch: { lastError: message } });
    metrics.unsupportedItems += 1;
    return { status: 'failed', size: 0, modifiedAt, message, reason: content.reason, metrics };
  }
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const hashDuplicate = await db.collection('media').findOne({ userId: user.id, hash, trashed: { $ne: true } });
  if (hashDuplicate) {
    metrics.contentHashSkips += 1;
    await markCloudAsset({
      db,
      userId: user.id,
      providerFileId: driveId,
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
      provider: 'google_drive',
      fileId: driveId,
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
    providerFileId: driveId,
    importState: CLOUD_ASSET_STATES.SAFE,
    patch: {
      mediaId: id,
      importOutcome: sourceDuplicate ? 'new_provider_version' : 'copied_and_verified',
      importedAt: new Date(),
      verifiedAt: new Date(),
      verificationHash: hash,
      lastError: null,
    },
  });
  return { status: 'saved', size: buffer.length, modifiedAt, mediaId: id, metrics };
}
