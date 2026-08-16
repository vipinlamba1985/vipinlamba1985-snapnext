import { deleteStoredMediaVerified } from './storage-strict-delete.js';
import { coordinatePermanentMediaDeletion } from './media-deletion-coordinator.server.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function trashRetentionDays(value = process.env.TRASH_RETENTION_DAYS) {
  return boundedInteger(value, DEFAULT_RETENTION_DAYS, 1, 365);
}

export function trashPurgeBatchSize(value = process.env.TRASH_PURGE_BATCH_SIZE) {
  return boundedInteger(value, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
}

export function trashCutoff({ now = new Date(), retentionDays = trashRetentionDays() } = {}) {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

function claimedDocument(result) {
  return result?.value || result || null;
}

export async function purgeExpiredTrash({
  db,
  now = new Date(),
  retentionDays = trashRetentionDays(),
  batchSize = trashPurgeBatchSize(),
  deleteStored = deleteStoredMediaVerified,
  coordinateDeletion = coordinatePermanentMediaDeletion,
} = {}) {
  if (!db?.collection) throw new Error('Database connection is required.');

  const cutoff = trashCutoff({ now, retentionDays });
  const media = db.collection('media');
  const candidates = await media
    .find({ trashed: true, trashedAt: { $lte: cutoff } })
    .sort({ trashedAt: 1, _id: 1 })
    .limit(batchSize)
    .toArray();

  const failures = [];
  let claimed = 0;
  let purged = 0;

  for (const candidate of candidates) {
    const item = claimedDocument(await media.findOneAndDelete({
      _id: candidate._id,
      trashed: true,
      trashedAt: candidate.trashedAt,
    }));
    if (!item) continue;
    claimed += 1;

    try {
      // The row is already claimed so a concurrent restore cannot race this
      // purge. Production uses the permanent-deletion coordinator, which moves
      // the deletion generation before source storage is removed and invalidates
      // controlled derived renders. The injectable seam is for unit testing only.
      await coordinateDeletion({
        db,
        userId: item.userId,
        docs: [item],
        removeRows: false,
        reason: 'trash_retention_purge',
        deleteStored,
      });
      purged += 1;
    } catch (error) {
      let restored = false;
      let restoreError = null;
      try {
        await media.insertOne({ ...item, trashPurgeFailedAt: new Date(), trashPurgeFailure: error?.message || String(error) });
        restored = true;
      } catch (reinsertionError) {
        restoreError = reinsertionError?.message || String(reinsertionError);
      }
      failures.push({
        id: item.id || String(item._id || ''),
        message: error?.message || String(error),
        recordRestored: restored,
        restoreError,
      });
    }
  }

  return {
    cutoff,
    retentionDays,
    examined: candidates.length,
    claimed,
    purged,
    failed: failures.length,
    failures,
    hasMore: candidates.length === batchSize,
  };
}
