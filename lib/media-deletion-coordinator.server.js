import {
  beginMediaDeletionGeneration,
  completeMediaDeletionGeneration,
} from './media-deletion-generation.server.js';
import { invalidateRenderArtifactsForSources } from './create-render-artifacts.server.js';
import { deleteStoredMediaVerified } from './storage-strict-delete.js';

function uniqueIds(values = []) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

export async function coordinatePermanentMediaDeletion({
  db,
  userId,
  ids = [],
  docs = null,
  removeRows = true,
  reason = 'permanent_media_delete',
  deleteStored = deleteStoredMediaVerified,
} = {}) {
  if (!db || !userId) throw new Error('Database and user id are required for permanent media deletion.');

  const requestedIds = uniqueIds(ids);
  const mediaDocs = Array.isArray(docs)
    ? docs.filter(doc => doc && String(doc.userId || '') === String(userId))
    : requestedIds.length
      ? await db.collection('media').find({ userId, id: { $in: requestedIds } }).toArray()
      : [];

  if (!mediaDocs.length) {
    return { generation: null, deleted: 0, derivedArtifactsInvalidated: 0, storageFailures: [] };
  }

  const sourceMediaIds = uniqueIds(mediaDocs.map(doc => doc.id));
  const generation = await beginMediaDeletionGeneration({ db, userId, reason });

  try {
    // The generation moves and is marked in-progress before any source pixels
    // are removed. New/cached renders will not publish through this deletion
    // window. Existing pending/ready derived artifacts are removed first.
    const derived = await invalidateRenderArtifactsForSources({
      db,
      userId,
      sourceMediaIds,
      reason,
      deleteStored,
    });

    const storageFailures = [];
    for (const doc of mediaDocs) {
      try {
        await deleteStored({ provider: doc.provider || 'local', storageKey: doc.storageKey });
      } catch (error) {
        storageFailures.push({
          mediaId: doc.id || String(doc._id || ''),
          storageKey: doc.storageKey || '',
          message: error?.message || String(error),
        });
      }
    }

    if (storageFailures.length) {
      const error = new Error('Some media files could not be removed and verified. Please retry deletion.');
      error.code = 'storage_cleanup_failed';
      error.generation = generation;
      error.failures = storageFailures;
      throw error;
    }

    let deleted = mediaDocs.length;
    if (removeRows) {
      const objectIds = mediaDocs.map(doc => doc._id).filter(Boolean);
      const filter = objectIds.length
        ? { userId, _id: { $in: objectIds } }
        : { userId, id: { $in: sourceMediaIds } };
      const result = await db.collection('media').deleteMany(filter);
      deleted = result?.deletedCount || 0;
    }

    return {
      generation,
      deleted,
      sourceMediaIds,
      derivedArtifactsInvalidated: derived.invalidated,
      storageFailures,
    };
  } finally {
    await completeMediaDeletionGeneration({ db, userId, generation }).catch(() => null);
  }
}
