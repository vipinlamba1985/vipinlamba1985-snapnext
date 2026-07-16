export const NATIVE_SMART_SYNC_VERSION = 1;

export function validateNativeManifest(input = {}) {
  const provider = input.provider;
  if (!['ios_photos', 'android_media'].includes(provider)) throw new Error('Unsupported native provider.');
  if (!Array.isArray(input.assets)) throw new Error('Assets are required.');
  if (input.assets.length > 500) throw new Error('Send no more than 500 assets per manifest.');

  return {
    version: NATIVE_SMART_SYNC_VERSION,
    provider,
    deviceId: String(input.deviceId || '').slice(0, 128),
    generatedAt: input.generatedAt ? new Date(input.generatedAt) : new Date(),
    assets: input.assets.map(asset => ({
      localId: String(asset.localId || '').slice(0, 256),
      kind: asset.kind === 'video' ? 'video' : 'photo',
      filename: String(asset.filename || 'Untitled').slice(0, 512),
      size: Number(asset.size || 0),
      createdAt: asset.createdAt ? new Date(asset.createdAt) : null,
      favorite: Boolean(asset.favorite),
      albumIds: Array.isArray(asset.albumIds) ? asset.albumIds.map(String).slice(0, 50) : [],
      confirmedPersonIds: Array.isArray(asset.confirmedPersonIds) ? asset.confirmedPersonIds.map(String).slice(0, 50) : [],
      checksum: asset.checksum ? String(asset.checksum) : null,
    })),
  };
}

export function buildNativeUploadPlan({ profile, manifest, remainingBytes }) {
  const priorities = new Map((profile.priority || []).map((rule, index) => [rule, index]));
  const rules = profile.rules || {};

  const eligible = manifest.assets.filter(asset => {
    if (rules.photosOnly && asset.kind !== 'photo') return false;
    if (rules.videosOnly && asset.kind !== 'video') return false;
    if (rules.favoritesOnly && !asset.favorite) return false;
    if (rules.albumIds?.length && !asset.albumIds.some(id => rules.albumIds.includes(id))) return false;
    if (rules.personIds?.length && !asset.confirmedPersonIds.some(id => rules.personIds.includes(id))) return false;
    return true;
  });

  eligible.sort((a, b) => {
    const score = asset => {
      if (asset.confirmedPersonIds.length && priorities.has('favorite_people')) return priorities.get('favorite_people');
      if (asset.favorite && priorities.has('favorites')) return priorities.get('favorites');
      if (asset.kind === 'photo' && priorities.has('photos')) return priorities.get('photos');
      if (asset.kind === 'video' && priorities.has('videos')) return priorities.get('videos');
      return 999;
    };
    return score(a) - score(b) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  const selected = [];
  let plannedBytes = 0;
  for (const asset of eligible) {
    if (asset.size <= 0) continue;
    if (remainingBytes && plannedBytes + asset.size > remainingBytes) break;
    selected.push(asset);
    plannedBytes += asset.size;
  }

  return { selected, plannedBytes, skipped: manifest.assets.length - selected.length };
}
