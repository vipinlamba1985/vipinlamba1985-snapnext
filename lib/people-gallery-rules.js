export const MIN_DISTINCT_PHOTOS_FOR_PEOPLE_THUMBNAIL = 3;
export const MAX_FAMILY_SIZED_FACE_COUNT = 4;

function count(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}

export function personThumbnailEligibility(person = {}, activeNames = []) {
  const name = String(person.clusterId || person.name || '').trim();
  const photoCount = count(person.livePhotoCount ?? person.distinctPhotoCount ?? person.photos ?? person.photoCount ?? person.count);
  const active = Boolean(name && activeNames?.includes?.(name));
  const manuallyRestored = Boolean(person.restoredAt);
  const self = Boolean(person.isSelf);

  if (self) return { eligible: true, reason: 'self', photoCount };
  if (active) return { eligible: true, reason: 'active', photoCount };
  if (manuallyRestored) return { eligible: true, reason: 'restored', photoCount };
  if (photoCount >= MIN_DISTINCT_PHOTOS_FOR_PEOPLE_THUMBNAIL) return { eligible: true, reason: 'recurring_face', photoCount };
  return { eligible: false, reason: 'needs_more_distinct_photos', photoCount };
}

export function classifyPersonMedia(item = {}, { selectedClusterId = '', activeClusterIds = [] } = {}) {
  const intelligence = item.peopleIntelligence || {};
  const faceIds = uniqueStrings(intelligence.faceIds);
  const clusterIds = uniqueStrings(intelligence.clusterIds);
  const selected = String(selectedClusterId || '').trim();
  const active = new Set(uniqueStrings(activeClusterIds));
  const detectedFaceCount = Math.max(1, faceIds.length, clusterIds.length);
  const groupPhoto = detectedFaceCount >= 2;
  const familySizedGroup = groupPhoto && detectedFaceCount <= MAX_FAMILY_SIZED_FACE_COUNT;
  const otherActiveClusterIds = clusterIds.filter((clusterId) => clusterId !== selected && active.has(clusterId));
  const hasOtherActivePerson = otherActiveClusterIds.length > 0;
  const largeGroupPhoto = detectedFaceCount > MAX_FAMILY_SIZED_FACE_COUNT;
  const bestEligible = !groupPhoto || familySizedGroup || hasOtherActivePerson;

  return {
    detectedFaceCount,
    groupPhoto,
    familySizedGroup,
    largeGroupPhoto,
    hasOtherActivePerson,
    otherActivePeopleCount: otherActiveClusterIds.length,
    bestEligible,
  };
}

export function annotatePersonMedia(item = {}, options = {}) {
  return { ...item, peopleContext: classifyPersonMedia(item, options) };
}
