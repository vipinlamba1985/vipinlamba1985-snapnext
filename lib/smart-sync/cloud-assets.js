import { v4 as uuidv4 } from 'uuid';

export const CLOUD_ASSET_STATES = {
  AVAILABLE: 'available_to_import',
  IMPORTING: 'importing',
  SAFE: 'safe_in_snapnext',
  FAILED: 'failed',
  REMOVED: 'source_removed',
  UNSUPPORTED: 'unsupported',
  CAPACITY: 'capacity_blocked',
};

export const EMPTY_SYNC_METRICS = Object.freeze({
  discoveredItems: 0,
  metadataUpserts: 0,
  providerApiCalls: 0,
  providerChecksumSkips: 0,
  contentHashSkips: 0,
  bytesDownloaded: 0,
  bytesStored: 0,
  capacityPreventedItems: 0,
  unsupportedItems: 0,
  removedItems: 0,
});

function number(value) {
  return Math.max(0, Number(value) || 0);
}

export function normalizeSyncMetrics(value = {}) {
  return Object.fromEntries(Object.keys(EMPTY_SYNC_METRICS).map(key => [key, number(value?.[key])]));
}

export function mergeSyncMetrics(...values) {
  const merged = normalizeSyncMetrics();
  for (const value of values) {
    const normalized = normalizeSyncMetrics(value);
    for (const key of Object.keys(merged)) merged[key] += normalized[key];
  }
  return merged;
}

export function metricsIncrementPatch(value = {}, prefix = 'syncMetrics') {
  const normalized = normalizeSyncMetrics(value);
  return Object.fromEntries(
    Object.entries(normalized)
      .filter(([, amount]) => amount > 0)
      .map(([key, amount]) => [`${prefix}.${key}`, amount]),
  );
}

export function normalizeProviderChecksum(meta = {}) {
  const candidates = [
    ['sha256', meta.sha256Checksum],
    ['md5', meta.md5Checksum],
    ['sha1', meta.sha1Checksum],
  ];
  const match = candidates.find(([, value]) => String(value || '').trim());
  return match ? { algorithm: match[0], value: String(match[1]).trim().toLowerCase() } : null;
}

export function isSupportedCloudMedia(meta = {}) {
  const mime = String(meta.mimeType || meta.mime || '');
  return mime.startsWith('image/') || mime.startsWith('video/');
}

export function normalizeDriveAsset(meta = {}) {
  const mime = String(meta.mimeType || meta.mime || '');
  const supported = isSupportedCloudMedia(meta);
  return {
    provider: 'google_drive',
    providerFileId: String(meta.id || meta.fileId || ''),
    name: String(meta.name || 'Untitled memory').slice(0, 500),
    mime,
    kind: mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'photo' : 'other',
    size: number(meta.size),
    createdAt: meta.createdTime ? new Date(meta.createdTime) : null,
    modifiedAt: meta.modifiedTime ? new Date(meta.modifiedTime) : meta.createdTime ? new Date(meta.createdTime) : null,
    thumbnailUrl: meta.thumbnailLink || null,
    providerChecksum: normalizeProviderChecksum(meta),
    providerVersion: meta.version ? String(meta.version) : null,
    sourceState: meta.trashed ? 'removed' : 'active',
    supported,
  };
}

export function resolveCloudAssetImportState(existing, nextAsset, requestedState = null) {
  if (requestedState) return requestedState;
  if (!nextAsset.supported) return CLOUD_ASSET_STATES.UNSUPPORTED;
  if (nextAsset.sourceState === 'removed') return CLOUD_ASSET_STATES.REMOVED;
  const sameVersion = Boolean(
    existing?.importState === CLOUD_ASSET_STATES.SAFE
    && (
      (existing.providerVersion && nextAsset.providerVersion && existing.providerVersion === nextAsset.providerVersion)
      || (
        existing.providerChecksum?.algorithm
        && nextAsset.providerChecksum?.algorithm === existing.providerChecksum.algorithm
        && nextAsset.providerChecksum?.value === existing.providerChecksum.value
      )
    ),
  );
  return sameVersion ? CLOUD_ASSET_STATES.SAFE : CLOUD_ASSET_STATES.AVAILABLE;
}

export async function ensureCloudAssetIndexes(db) {
  await Promise.all([
    db.collection('cloud_assets').createIndex(
      { userId: 1, provider: 1, providerFileId: 1 },
      { unique: true, name: 'cloud_asset_identity' },
    ),
    db.collection('cloud_assets').createIndex(
      { userId: 1, provider: 1, importState: 1, modifiedAt: -1 },
      { name: 'cloud_asset_inventory' },
    ),
  ]);
}

export async function upsertCloudAsset({
  db,
  userId,
  provider = 'google_drive',
  meta,
  importState = null,
  jobId = null,
  extra = {},
}) {
  const normalized = provider === 'google_drive'
    ? normalizeDriveAsset(meta)
    : {
        provider,
        providerFileId: String(meta?.id || meta?.fileId || ''),
        name: String(meta?.name || 'Untitled memory').slice(0, 500),
        mime: String(meta?.mimeType || meta?.mime || ''),
        kind: meta?.kind || 'other',
        size: number(meta?.size),
        createdAt: meta?.createdAt ? new Date(meta.createdAt) : null,
        modifiedAt: meta?.modifiedAt ? new Date(meta.modifiedAt) : null,
        thumbnailUrl: meta?.thumbnailUrl || null,
        providerChecksum: meta?.providerChecksum || null,
        providerVersion: meta?.providerVersion ? String(meta.providerVersion) : null,
        sourceState: meta?.sourceState || 'active',
        supported: meta?.supported !== false,
      };
  if (!normalized.providerFileId) throw new Error('Cloud asset provider file id is required.');

  const key = { userId, provider, providerFileId: normalized.providerFileId };
  const existing = await db.collection('cloud_assets').findOne(key);
  const state = resolveCloudAssetImportState(existing, normalized, importState);
  const now = new Date();
  const id = existing?.id || uuidv4();
  await db.collection('cloud_assets').updateOne(
    key,
    {
      $set: {
        ...normalized,
        ...extra,
        id,
        userId,
        provider,
        importState: state,
        lastSeenAt: now,
        updatedAt: now,
        ...(jobId ? { lastJobId: jobId } : {}),
      },
      $setOnInsert: { discoveredAt: now },
    },
    { upsert: true },
  );
  return { ...existing, ...normalized, ...extra, id, userId, provider, importState: state };
}

export async function markCloudAsset({
  db,
  userId,
  provider = 'google_drive',
  providerFileId,
  importState,
  patch = {},
}) {
  const now = new Date();
  await db.collection('cloud_assets').updateOne(
    { userId, provider, providerFileId: String(providerFileId) },
    { $set: { importState, ...patch, updatedAt: now } },
  );
}

export async function cloudInventorySnapshot(db, userId, provider = null) {
  const match = { userId, ...(provider ? { provider } : {}) };
  const rows = await db.collection('cloud_assets').aggregate([
    { $match: match },
    {
      $group: {
        _id: '$importState',
        items: { $sum: 1 },
        bytes: { $sum: { $ifNull: ['$size', 0] } },
      },
    },
  ]).toArray();
  const byState = Object.fromEntries(rows.map(row => [row._id || CLOUD_ASSET_STATES.AVAILABLE, {
    items: number(row.items),
    bytes: number(row.bytes),
  }]));
  const totals = rows.reduce((sum, row) => ({
    items: sum.items + number(row.items),
    bytes: sum.bytes + number(row.bytes),
  }), { items: 0, bytes: 0 });
  return {
    provider: provider || 'all',
    totals,
    byState,
    available: byState[CLOUD_ASSET_STATES.AVAILABLE] || { items: 0, bytes: 0 },
    safe: byState[CLOUD_ASSET_STATES.SAFE] || { items: 0, bytes: 0 },
    failed: byState[CLOUD_ASSET_STATES.FAILED] || { items: 0, bytes: 0 },
    removed: byState[CLOUD_ASSET_STATES.REMOVED] || { items: 0, bytes: 0 },
  };
}
