export const NATIVE_SMART_SYNC_VERSION = 2;

const NATIVE_PROVIDERS = ['ios_photos', 'android_media'];

export function validateNativeManifest(input = {}) {
  const provider = input.provider;
  if (!NATIVE_PROVIDERS.includes(provider)) throw new Error('Unsupported native provider.');
  if (!Array.isArray(input.assets)) throw new Error('Assets are required.');
  if (input.assets.length > 500) throw new Error('Send no more than 500 assets per manifest.');

  return {
    version: NATIVE_SMART_SYNC_VERSION,
    provider,
    deviceId: String(input.deviceId || '').trim().slice(0, 128),
    generatedAt: input.generatedAt ? new Date(input.generatedAt) : new Date(),
    assets: input.assets.map(asset => ({
      localId: String(asset.localId || '').slice(0, 256),
      kind: asset.kind === 'video' ? 'video' : 'photo',
      filename: String(asset.filename || 'Untitled').slice(0, 512),
      size: Math.max(0, Number(asset.size || 0)),
      createdAt: asset.createdAt ? new Date(asset.createdAt) : null,
      favorite: Boolean(asset.favorite),
      albumIds: Array.isArray(asset.albumIds) ? asset.albumIds.map(String).slice(0, 50) : [],
      confirmedPersonIds: Array.isArray(asset.confirmedPersonIds) ? asset.confirmedPersonIds.map(String).slice(0, 50) : [],
      checksum: asset.checksum ? String(asset.checksum).slice(0, 256) : null,
    })),
  };
}

function normalizedRules(profile = {}) {
  return (Array.isArray(profile.rules) ? profile.rules : [])
    .filter(rule => rule?.enabled !== false)
    .map((rule, index) => ({
      type: String(rule.type || ''),
      priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : index + 1,
      targetIds: Array.isArray(rule.targetIds) ? rule.targetIds.map(String) : [],
    }))
    .sort((a, b) => a.priority - b.priority);
}

function matchesRule(asset, rule, recentCutoff) {
  if (rule.type === 'favorite_people') {
    if (!asset.confirmedPersonIds.length) return false;
    return !rule.targetIds.length || asset.confirmedPersonIds.some(id => rule.targetIds.includes(id));
  }
  if (rule.type === 'favorites') return asset.favorite;
  if (rule.type === 'recent') return Boolean(asset.createdAt && asset.createdAt >= recentCutoff);
  if (rule.type === 'photos_first') return asset.kind === 'photo';
  if (rule.type === 'videos_first') return asset.kind === 'video';
  if (rule.type === 'album') return rule.targetIds.length > 0 && asset.albumIds.some(id => rule.targetIds.includes(id));
  if (rule.type === 'manual') return true;
  if (rule.type === 'everything') return true;
  return false;
}

export function buildNativeUploadPlan({ profile, manifest, remainingBytes, unlimited = false, duplicateChecksums = [] }) {
  const rules = normalizedRules(profile);
  const recentCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const duplicateSet = new Set((duplicateChecksums || []).filter(Boolean).map(String));
  const includeEverything = rules.some(rule => ['everything', 'manual'].includes(rule.type));

  const ranked = manifest.assets
    .filter(asset => asset.size > 0 && (!asset.checksum || !duplicateSet.has(asset.checksum)))
    .map(asset => {
      const matchedIndex = rules.findIndex(rule => matchesRule(asset, rule, recentCutoff));
      return { asset, matchedIndex, matchedRule: matchedIndex >= 0 ? rules[matchedIndex].type : null };
    })
    .filter(item => item.matchedIndex >= 0 || includeEverything || rules.length === 0)
    .sort((left, right) => {
      const leftRank = left.matchedIndex >= 0 ? left.matchedIndex : 999;
      const rightRank = right.matchedIndex >= 0 ? right.matchedIndex : 999;
      return leftRank - rightRank || new Date(right.asset.createdAt || 0) - new Date(left.asset.createdAt || 0);
    });

  const selected = [];
  let plannedBytes = 0;
  let capacityReached = false;
  for (const item of ranked) {
    if (!unlimited && plannedBytes + item.asset.size > Math.max(0, Number(remainingBytes) || 0)) {
      capacityReached = true;
      continue;
    }
    selected.push({ ...item.asset, matchedRule: item.matchedRule });
    plannedBytes += item.asset.size;
  }

  return {
    selected,
    plannedBytes,
    skipped: manifest.assets.length - selected.length,
    duplicateCount: manifest.assets.filter(asset => asset.checksum && duplicateSet.has(asset.checksum)).length,
    capacityReached,
    appliedRules: rules.map(rule => rule.type),
  };
}
