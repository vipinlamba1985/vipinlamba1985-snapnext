export const SMART_SYNC_PROVIDERS = [
  { id: 'google_drive', name: 'Google Drive', surface: 'web', auth: 'oauth', capabilities: ['browse', 'folders', 'auto_sync', 'priority'], syncStrategy: 'durable_cloud_job' },
  { id: 'google_photos', name: 'Google Photos', surface: 'web', auth: 'picker_oauth', capabilities: ['user_picker', 'manual_import', 'priority'], syncStrategy: 'user_selected_picker' },
  { id: 'dropbox', name: 'Dropbox', surface: 'web', auth: 'oauth', capabilities: ['browse', 'folders', 'auto_sync', 'priority'], syncStrategy: 'adapter_required' },
  { id: 'onedrive', name: 'Microsoft OneDrive', surface: 'web', auth: 'oauth', capabilities: ['browse', 'folders', 'albums', 'auto_sync', 'priority'], syncStrategy: 'adapter_required' },
  { id: 'ios_photos', name: 'iPhone & iPad Photos', surface: 'native', auth: 'native_permission', capabilities: ['library', 'albums', 'favorites', 'confirmed_people', 'background_upload', 'priority'], syncStrategy: 'native_background' },
  { id: 'android_media', name: 'Android Photos & Videos', surface: 'native', auth: 'native_permission', capabilities: ['library', 'albums', 'favorites', 'confirmed_people', 'background_upload', 'priority'], syncStrategy: 'native_background' },
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
    { id: 'favorite_people', type: 'favorite_people', label: 'Favourite people first', enabled: true, priority: 1, targetIds: [] },
    { id: 'favorites', type: 'favorites', label: 'Favourites first', enabled: true, priority: 2, targetIds: [] },
    { id: 'recent', type: 'recent', label: 'Recent memories', enabled: true, priority: 3, targetIds: [] },
    { id: 'everything', type: 'everything', label: 'Everything else', enabled: false, priority: 4, targetIds: [] },
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
    approvedAt: input.approvedAt ? new Date(input.approvedAt) : null,
  };
}

export function smartSyncSummary(profile) {
  const normalized = normalizeSmartSyncProfile(profile);
  return normalized.rules.filter(rule => rule.enabled).map(rule => rule.label);
}
