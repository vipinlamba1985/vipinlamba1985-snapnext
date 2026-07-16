export const SMART_SYNC_PROVIDERS = [
  { id: 'google_drive', name: 'Google Drive', surface: 'web', available: true },
  { id: 'device_photos', name: 'Device Photos', surface: 'native', available: false },
  { id: 'dropbox', name: 'Dropbox', surface: 'web', available: false },
  { id: 'onedrive', name: 'Microsoft OneDrive', surface: 'web', available: false },
  { id: 'google_photos', name: 'Google Photos', surface: 'web', available: false },
];

export const SMART_SYNC_RULE_TYPES = [
  'everything',
  'favorites',
  'favorite_people',
  'recent',
  'photos_first',
  'videos_first',
  'album',
  'manual',
];

export const DEFAULT_SMART_SYNC_PROFILE = {
  enabled: false,
  providerId: 'google_drive',
  mode: 'manual',
  rules: [
    { id: 'favorites', type: 'favorites', label: 'Favourites first', enabled: true, priority: 1 },
    { id: 'recent', type: 'recent', label: 'Recent memories', enabled: true, priority: 2 },
    { id: 'everything', type: 'everything', label: 'Everything else', enabled: false, priority: 3 },
  ],
  stopAtCapacity: true,
  requirePreflightApproval: true,
  notifyOnComplete: true,
};

export function normalizeSmartSyncProfile(input = {}) {
  const providerId = SMART_SYNC_PROVIDERS.some(provider => provider.id === input.providerId)
    ? input.providerId
    : DEFAULT_SMART_SYNC_PROFILE.providerId;

  const rules = Array.isArray(input.rules)
    ? input.rules
        .filter(rule => SMART_SYNC_RULE_TYPES.includes(rule?.type))
        .slice(0, 20)
        .map((rule, index) => ({
          id: String(rule.id || `${rule.type}-${index + 1}`).slice(0, 80),
          type: rule.type,
          label: String(rule.label || rule.type).slice(0, 120),
          enabled: rule.enabled !== false,
          priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : index + 1,
          targetIds: Array.isArray(rule.targetIds) ? rule.targetIds.map(String).slice(0, 100) : [],
        }))
        .sort((a, b) => a.priority - b.priority)
        .map((rule, index) => ({ ...rule, priority: index + 1 }))
    : DEFAULT_SMART_SYNC_PROFILE.rules;

  return {
    enabled: Boolean(input.enabled),
    providerId,
    mode: SMART_SYNC_RULE_TYPES.includes(input.mode) ? input.mode : 'manual',
    rules,
    stopAtCapacity: input.stopAtCapacity !== false,
    requirePreflightApproval: input.requirePreflightApproval !== false,
    notifyOnComplete: input.notifyOnComplete !== false,
  };
}

export function smartSyncSummary(profile) {
  const normalized = normalizeSmartSyncProfile(profile);
  return normalized.rules.filter(rule => rule.enabled).map(rule => rule.label);
}
