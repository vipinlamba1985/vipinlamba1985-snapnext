import { isDocsItem, isScreenshotMedia, mediaCategory } from '@/lib/media-category';

export const PEOPLE_INTELLIGENCE_VERSION = 1;
export const FACE_MATCH_THRESHOLD = 92;

const GENERIC_IDENTITY_LABELS = new Set([
  'woman', 'women', 'man', 'men', 'child', 'children', 'kid', 'kids', 'girl', 'girls',
  'boy', 'boys', 'person', 'people', 'face', 'unknown', 'adult', 'baby', 'toddler',
  'mother', 'mom', 'father', 'dad', 'family', 'friend', 'user', 'self',
]);

export function isGenericIdentityLabel(value) {
  return GENERIC_IDENTITY_LABELS.has(String(value || '').trim().toLowerCase());
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
  return {
    Left: clamp(box.Left),
    Top: clamp(box.Top),
    Width: clamp(box.Width),
    Height: clamp(box.Height),
  };
}

export function faceCropStyle(box = {}) {
  const width = Math.max(0.08, Number(box.Width || 0.3));
  const height = Math.max(0.08, Number(box.Height || 0.3));
  const centerX = Math.max(0, Math.min(100, (Number(box.Left || 0) + width / 2) * 100));
  const centerY = Math.max(0, Math.min(100, (Number(box.Top || 0) + height / 2) * 100));
  const scale = Math.max(1.35, Math.min(6, 0.72 / Math.max(width, height)));
  return {
    objectPosition: `${centerX}% ${centerY}%`,
    transform: `scale(${scale})`,
    transformOrigin: `${centerX}% ${centerY}%`,
  };
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
    representativeFaceBox: cluster.representativeFaceBox || null,
    representativeQuality: Number(cluster.representativeQuality || 0),
    status: cluster.status || 'discovered',
  };
}
