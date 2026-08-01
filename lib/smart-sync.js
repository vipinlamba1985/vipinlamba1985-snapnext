// Providers are declared once, in lib/smart-sync/providers.js. This array used
// to be a second hand-maintained copy; it is now a view over the one registry
// so the two can no longer disagree about which clouds exist.
import { SMART_SYNC_PROVIDERS as PROVIDER_REGISTRY } from './smart-sync/providers.js';

export const SMART_SYNC_PROVIDERS = Object.values(PROVIDER_REGISTRY);

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

export const SMART_SYNC_MODES = [
  'index_only',
  'protect_important',
  'protect_everything_that_fits',
];

export const SMART_SYNC_MODE_DETAILS = {
  index_only: {
    label: 'Understand my library',
    description: 'Map what is available and prepare recommendations without copying originals.',
  },
  protect_important: {
    label: 'Protect important memories',
    description: 'Index the source, then protect favourites and recent memories first.',
  },
  protect_everything_that_fits: {
    label: 'Protect everything that fits',
    description: 'Copy in priority order until your available SnapNext storage is full.',
  },
};

export const DEFAULT_SMART_SYNC_PROFILE = {
  enabled: false,
  providerId: 'google_drive',
  mode: 'manual',
  syncMode: 'protect_important',
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
    syncMode: SMART_SYNC_MODES.includes(input.syncMode) ? input.syncMode : DEFAULT_SMART_SYNC_PROFILE.syncMode,
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
