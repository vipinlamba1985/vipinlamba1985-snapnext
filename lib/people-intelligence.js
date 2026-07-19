import { isDocsItem, isScreenshotMedia, mediaCategory } from '@/lib/media-category';
export { FACE_AUTO_ASSIGN_THRESHOLD, FACE_MATCH_THRESHOLD, matchDecision, rekognitionUserId } from '@/lib/people-match';

export const PEOPLE_INTELLIGENCE_VERSION = 2;

const GENERIC_IDENTITY_LABELS = new Set([
  'woman', 'women', 'man', 'men', 'child', 'children', 'kid', 'kids', 'girl', 'girls',
  'boy', 'boys', 'person', 'people', 'face', 'unknown', 'adult', 'baby', 'toddler',
  'mother', 'mom', 'father', 'dad', 'family', 'friend', 'user', 'self',
]);

export function isGenericIdentityLabel(value) {
  return GENERIC_IDENTITY_LABELS.has(String(value || '').trim().toLowerCase());
}

export function peopleCollectionId(userId) {
  const input = String(userId || '');
  const parts = [2166136261, 2246822519, 3266489917, 668265263];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    for (let j = 0; j < parts.length; j += 1) {
      parts[j] ^= code + j * 31;
      parts[j] = Math.imul(parts[j], 16777619 + j * 2) >>> 0;
    }
  }
  const hex = parts.map((value) => value.toString(16).padStart(8, '0')).join('');
  return `snapnext_${hex}`;
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

export function faceCropStyle(box = {}) {
  const width = Math.max(0.06, Number(box.Width || 0.3));
  const height = Math.max(0.06, Number(box.Height || 0.3));
  const centerX = Math.max(0, Math.min(1, Number(box.Left || 0) + width / 2));
  const centerY = Math.max(0, Math.min(1, Number(box.Top || 0) + height / 2));
  const scale = Math.max(1.65, Math.min(7.5, 0.56 / Math.max(width, height)));
  return {
    objectPosition: '50% 50%',
    transform: `translate(${(0.5 - centerX) * 100}%, ${(0.5 - centerY) * 100}%) scale(${scale})`,
    transformOrigin: '50% 50%',
    willChange: 'transform',
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
    rekognitionUserId: cluster.rekognitionUserId || null,
    verificationStatus: cluster.verificationStatus || 'suggested',
    bestSimilarity: Number(cluster.bestSimilarity || 0),
    status: cluster.status || 'discovered',
  };
}
