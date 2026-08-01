/**
 * Reconciliation rules for People identities polluted by large group photos.
 *
 * Before the index-time exclusion landed, `indexMediaFaces` created and
 * strengthened one identity cluster per detected face. A crowd shot therefore
 * spawned a cluster per guest and inflated the distinct-photo counts that gate
 * People suggestions. New indexing is correct; this module describes how to
 * repair rows written before that fix.
 *
 * Design notes:
 *  - People counts are computed live from `media.peopleIntelligence.clusterIds`
 *    (see app/api/magic-library/people/route.js), so detaching a group photo
 *    from its clusters corrects every count derived from it. Stored cluster
 *    membership is cleaned too, because the historical-count fallback and
 *    legacy name inheritance both read `person_clusters.mediaIds`.
 *  - No Rekognition call is ever required: the decision uses face ids already
 *    stored on the media document, so reconciliation costs nothing.
 *  - Originals are never modified or deleted. Only `peopleIntelligence`
 *    metadata and identity bookkeeping change.
 */
// Relative import keeps this module loadable by the Node test runner, which
// does not resolve the `@/` alias.
import { MAX_FAMILY_SIZED_FACE_COUNT, isLargeGroupPhoto } from './people-gallery-rules.js';

export { MAX_FAMILY_SIZED_FACE_COUNT, isLargeGroupPhoto };

/** Statuses that already record a completed large-group decision. */
export const GROUP_PHOTO_STATUS = 'group_photo';

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function isMeaningfulName(value) {
  const name = String(value || '').trim();
  if (!name) return false;
  return !['add name', 'unknown', 'person'].includes(name.toLowerCase());
}

/** Usable faces recorded for a media item, from data already stored. */
export function storedFaceCount(media = {}) {
  const intelligence = media.peopleIntelligence || {};
  if (Number.isFinite(Number(intelligence.detectedFaceCount))) {
    return Math.max(0, Math.floor(Number(intelligence.detectedFaceCount)));
  }
  return uniqueStrings(intelligence.faceIds).length;
}

/**
 * A photo needs reconciliation when it is a large group photo that was indexed
 * before the exclusion existed — i.e. it still carries identity attachments.
 * Idempotent: once rewritten it no longer matches.
 */
export function needsGroupPhotoReconciliation(media = {}) {
  const intelligence = media.peopleIntelligence || {};
  if (intelligence.status === GROUP_PHOTO_STATUS) return false;
  if (!isLargeGroupPhoto(storedFaceCount(media))) return false;
  return uniqueStrings(intelligence.clusterIds).length > 0;
}

/**
 * Clusters the user has invested in are never hidden by an automatic repair,
 * even if a group photo was their only evidence. Losing a named or confirmed
 * person silently would be worse than an imperfect thumbnail.
 */
export function isUserProtectedCluster(cluster = {}, activeClusterIds = []) {
  if (cluster.isSelf) return true;
  if (cluster.restoredAt) return true;
  if (isMeaningfulName(cluster.displayName)) return true;
  if (cluster.verificationStatus === 'confirmed') return true;
  return uniqueStrings(activeClusterIds).includes(String(cluster.clusterId || '').trim());
}

/** Highest-quality remaining face, used to re-pick a representative thumbnail. */
export function chooseRepresentativeFace(faces = []) {
  const usable = (Array.isArray(faces) ? faces : []).filter((face) => face?.faceId && face?.mediaId);
  if (!usable.length) return null;
  return usable.reduce((best, face) => (
    Number(face.quality || 0) > Number(best.quality || 0) ? face : best
  ), usable[0]);
}

/**
 * Decide what happens to one cluster after its group-photo faces are detached.
 *
 * `remainingFaces` are the cluster's face_index rows that do NOT belong to a
 * reconciled group photo.
 */
export function planClusterRepair({ cluster = {}, remainingFaces = [], activeClusterIds = [] } = {}) {
  const protectedCluster = isUserProtectedCluster(cluster, activeClusterIds);
  const replacement = chooseRepresentativeFace(remainingFaces);
  const representativeWasGroupPhoto = Boolean(
    cluster.representativeMediaId
    && !remainingFaces.some((face) => String(face.mediaId) === String(cluster.representativeMediaId)),
  );

  if (!remainingFaces.length) {
    // Nothing legitimate is left backing this identity.
    return {
      action: protectedCluster ? 'keep_protected' : 'hide',
      protected: protectedCluster,
      representative: null,
      reason: protectedCluster ? 'user_protected_without_remaining_faces' : 'no_remaining_evidence',
    };
  }

  if (representativeWasGroupPhoto) {
    return {
      action: 'repoint_representative',
      protected: protectedCluster,
      representative: replacement,
      reason: 'representative_came_from_group_photo',
    };
  }

  return {
    action: 'keep',
    protected: protectedCluster,
    representative: null,
    reason: 'representative_still_valid',
  };
}

/**
 * Cluster-level outcome counts for the reconciliation report. The number of
 * media rewritten is supplied separately by the caller, since one group photo
 * can touch many clusters.
 */
export function summarizeReconciliation(clusterResults = []) {
  const rows = Array.isArray(clusterResults) ? clusterResults : [];
  return {
    clustersInspected: rows.length,
    clustersRepointed: rows.filter((row) => row.action === 'repoint_representative').length,
    clustersHidden: rows.filter((row) => row.action === 'hide').length,
    clustersProtected: rows.filter((row) => row.action === 'keep_protected').length,
  };
}
