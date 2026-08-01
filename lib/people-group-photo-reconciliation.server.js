/**
 * Applies the group-photo reconciliation plan to stored data.
 *
 * Safety contract:
 *  - never reads or writes original media bytes, and never trashes or deletes
 *    a media document — only its `peopleIntelligence` metadata changes;
 *  - never calls Rekognition, so a repair costs nothing and cannot fail on
 *    AWS permissions;
 *  - bounded by `limit` and idempotent, so it can be run repeatedly and
 *    resumed after an interruption without double-counting;
 *  - scoped to a single authenticated user on every query.
 */
import { PEOPLE_INTELLIGENCE_VERSION } from '@/lib/people-intelligence';
import {
  GROUP_PHOTO_STATUS,
  MAX_FAMILY_SIZED_FACE_COUNT,
  isLargeGroupPhoto,
  planClusterRepair,
  storedFaceCount,
  summarizeReconciliation,
} from '@/lib/people-group-photo-reconciliation';

const MAX_BATCH = 200;

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

// faceIds[MAX_FAMILY_SIZED_FACE_COUNT] existing means at least one face beyond
// a family-sized group, i.e. a large group photo. Mongo cannot express
// "array longer than N" directly, so the index probe stands in for it.
const FIRST_CROWD_FACE_INDEX = MAX_FAMILY_SIZED_FACE_COUNT;

/** Media that still attaches identities despite being a large group photo. */
export function pendingGroupPhotoQuery(userId) {
  return {
    userId,
    trashed: { $ne: true },
    kind: 'photo',
    'peopleIntelligence.status': { $ne: GROUP_PHOTO_STATUS },
    [`peopleIntelligence.faceIds.${FIRST_CROWD_FACE_INDEX}`]: { $exists: true },
    'peopleIntelligence.clusterIds.0': { $exists: true },
  };
}

export async function countPendingGroupPhotoCleanup({ db, userId }) {
  return db.collection('media').countDocuments(pendingGroupPhotoQuery(userId));
}

export async function reconcileGroupPhotoClusters({ db, userId, limit = 50 }) {
  const batchSize = Math.max(1, Math.min(MAX_BATCH, Number(limit || 50)));
  const candidates = await db.collection('media')
    .find(pendingGroupPhotoQuery(userId))
    .sort({ createdAt: 1 })
    .limit(batchSize)
    .toArray();

  if (!candidates.length) {
    return {
      mediaReconciled: 0,
      ...summarizeReconciliation([]),
      remaining: await countPendingGroupPhotoCleanup({ db, userId }),
      results: [],
    };
  }

  const activation = await db.collection('magic_library_activation').findOne({ userId });
  const activeClusterIds = uniqueStrings(activation?.active);

  // Verify with stored data only; never re-detect faces.
  const reconciled = candidates.filter((item) => isLargeGroupPhoto(storedFaceCount(item)));
  const touchedClusterIds = new Set();
  const now = new Date();

  for (const item of reconciled) {
    const clusterIds = uniqueStrings(item.peopleIntelligence?.clusterIds);
    const faceIds = uniqueStrings(item.peopleIntelligence?.faceIds);
    clusterIds.forEach((clusterId) => touchedClusterIds.add(clusterId));

    // 1. Detach the photo from every identity. Live People counts read this
    //    field, so removing it corrects each affected count immediately.
    await db.collection('media').updateOne(
      { id: item.id, userId },
      {
        $set: {
          'peopleIntelligence.version': PEOPLE_INTELLIGENCE_VERSION,
          'peopleIntelligence.status': GROUP_PHOTO_STATUS,
          'peopleIntelligence.reason': 'large_group_photo',
          'peopleIntelligence.clusterIds': [],
          'peopleIntelligence.detectedFaceCount': storedFaceCount(item),
          'peopleIntelligence.reconciledAt': now,
        },
      },
    );

    // 2. Drop stored cluster membership (historical counts and legacy name
    //    inheritance both read these arrays).
    if (clusterIds.length) {
      await db.collection('person_clusters').updateMany(
        { userId, clusterId: { $in: clusterIds } },
        { $pull: { mediaIds: item.id, faceIds: { $in: faceIds } }, $set: { updatedAt: now } },
      );
    }

    // 3. Remove the face rows so they cannot back a thumbnail or a match.
    if (faceIds.length) {
      await db.collection('face_index').deleteMany({ userId, faceId: { $in: faceIds } });
    }
  }

  // 4. Repair each affected cluster from whatever legitimate faces remain.
  const results = [];
  for (const clusterId of touchedClusterIds) {
    const cluster = await db.collection('person_clusters').findOne({ userId, clusterId });
    if (!cluster) continue;

    const remainingFaces = await db.collection('face_index')
      .find({ userId, clusterId })
      .project({ faceId: 1, mediaId: 1, quality: 1, boundingBox: 1 })
      .toArray();

    const plan = planClusterRepair({ cluster, remainingFaces, activeClusterIds });

    if (plan.action === 'repoint_representative' && plan.representative) {
      await db.collection('person_clusters').updateOne(
        { userId, clusterId },
        {
          $set: {
            representativeMediaId: plan.representative.mediaId,
            representativeFaceId: plan.representative.faceId,
            representativeFaceBox: plan.representative.boundingBox || cluster.representativeFaceBox,
            representativeQuality: Number(plan.representative.quality || 0),
            updatedAt: now,
          },
        },
      );
    } else if (plan.action === 'hide') {
      // Reversible: hidden clusters remain listed by the Recover People dialog.
      await db.collection('person_clusters').updateOne(
        { userId, clusterId },
        { $set: { status: 'hidden', hiddenReason: 'group_photo_reconciliation', updatedAt: now } },
      );
    }

    results.push({ clusterId, action: plan.action, reason: plan.reason, protected: plan.protected });
  }

  return {
    mediaReconciled: reconciled.length,
    ...summarizeReconciliation(results),
    remaining: await countPendingGroupPhotoCleanup({ db, userId }),
    results,
  };
}
