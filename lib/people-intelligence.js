import { isDocsItem, isScreenshotMedia, mediaCategory } from '@/lib/media-category';
import { sanitizeThumbnailCrop } from '@/lib/people-thumbnail';
export { FACE_AUTO_ASSIGN_THRESHOLD, FACE_MATCH_THRESHOLD, matchDecision, rekognitionUserId } from '@/lib/people-match';

export const PEOPLE_INTELLIGENCE_VERSION = 3;

const GENERIC_IDENTITY_LABELS = new Set([
  'woman', 'women', 'man', 'men', 'child', 'children', 'kid', 'kids', 'girl', 'girls',
  'boy', 'boys', 'person', 'people', 'face', 'unknown', 'adult', 'baby', 'toddler',
  'mother', 'mom', 'father', 'dad', 'family', 'friend', 'user', 'self',
]);

export function isGenericIdentityLabel(value) {
  return GENERIC_IDENTITY_LABELS.has(String(value || '').trim().toLowerCase());
}

export function peopleCollectionId(userId) {
  const input = `${String(userId || '')}:people-v${PEOPLE_INTELLIGENCE_VERSION}`;
  const parts = [2166136261, 2246822519, 3266489917, 668265263];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    for (let j = 0; j < parts.length; j += 1) {
      parts[j] ^= code + j * 31;
      parts[j] = Math.imul(parts[j], 16777619 + j * 2) >>> 0;
    }
  }
  const hex = parts.map((value) => value.toString(16).padStart(8, '0')).join('');
  return `snapnext_people_v${PEOPLE_INTELLIGENCE_VERSION}_${hex}`;
}

export function eligibleForPeopleIndex(item = {}) {
  if (item.trashed) return false;
  if (item.kind !== 'photo') return false;
  if (isScreenshotMedia(item)) return false;
  if (isDocsItem(item)) return false;
  return mediaCategory(item) === 'photos';
}

export function faceQualityScore(faceDetail = {}, face = {}) {
  const box = faceDetail.BoundingBox || face.BoundingBox || {};
  const quality = faceDetail.Quality || {};
  const pose = faceDetail.Pose || {};
  const area = Math.max(0, Number(box.Width || 0) * Number(box.Height || 0));
  const sizeScore = Math.min(1, area / 0.08) * 35;
  const sharpness = Math.min(100, Number(quality.Sharpness || 0)) * 0.25;
  const brightness = Math.min(100, Number(quality.Brightness || 0)) * 0.12;
  const confidence = Math.min(100, Number(face.Confidence || faceDetail.Confidence || 0)) * 0.18;
  const posePenalty = (Math.abs(Number(pose.Yaw || 0)) + Math.abs(Number(pose.Pitch || 0))) * 0.18;
  return Math.max(0, Math.round((sizeScore + sharpness + brightness + confidence - posePenalty) * 100) / 100);
}

export function cleanFaceBox(box = {}) {
  const clamp = (value) => Math.max(0, Math.min(1, Number(value || 0)));
  return { Left: clamp(box.Left), Top: clamp(box.Top), Width: clamp(box.Width), Height: clamp(box.Height) };
}

export function isUsableFaceBox(box = {}) {
  const width = Number(box.Width || 0);
  const height = Number(box.Height || 0);
  const left = Number(box.Left || 0);
  const top = Number(box.Top || 0);
  return width >= 0.02 && height >= 0.02 && left >= 0 && top >= 0 && left + width <= 1.02 && top + height <= 1.02;
}

export function clusterDisplayName(cluster = {}) {
  const name = String(cluster.displayName || '').trim();
  if (name && !isGenericIdentityLabel(name)) return name;
  return 'Add name';
}

export function cleanCluster(cluster = {}) {
  return {
    clusterId: cluster.clusterId,
    name: cluster.clusterId,
    displayName: clusterDisplayName(cluster),
    count: Array.isArray(cluster.mediaIds) ? cluster.mediaIds.length : Number(cluster.memoryCount || 0),
    photos: Number(cluster.photoCount || (Array.isArray(cluster.mediaIds) ? cluster.mediaIds.length : 0)),
    videos: Number(cluster.videoCount || 0),
    representativeMediaId: cluster.representativeMediaId || null,
    representativeFaceId: cluster.representativeFaceId || null,
    representativeFaceBox: cluster.representativeFaceBox || null,
    representativeQuality: Number(cluster.representativeQuality || 0),
    thumbnailCrop: cluster.thumbnailCrop ? sanitizeThumbnailCrop(cluster.thumbnailCrop) : null,
    rekognitionUserId: cluster.rekognitionUserId || null,
    verificationStatus: cluster.verificationStatus || 'suggested',
    bestSimilarity: Number(cluster.bestSimilarity || 0),
    indexVersion: Number(cluster.indexVersion || 0),
    status: cluster.status || 'discovered',
  };
}
