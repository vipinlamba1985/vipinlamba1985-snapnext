import { DEFAULT_SMART_SYNC_PROFILE, SMART_SYNC_MODES } from '../smart-sync.js';

const RECENT_WINDOW_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export function normalizeSmartSyncMode(value) {
  return SMART_SYNC_MODES.includes(value) ? value : DEFAULT_SMART_SYNC_PROFILE.syncMode;
}

function enabledRules(rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .filter(rule => rule?.enabled !== false)
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0));
}

export function driveItemMatchesImportant(item = {}, rules = [], now = new Date()) {
  const active = enabledRules(rules);
  const timestamp = new Date(item.createdTime || item.modifiedTime || 0).getTime();
  const recentThreshold = now.getTime() - RECENT_WINDOW_MS;

  return active.some(rule => {
    if (rule.type === 'favorites') return item.starred === true || item.favorite === true;
    if (rule.type === 'recent') return Number.isFinite(timestamp) && timestamp >= recentThreshold;
    return false;
  });
}

export function selectDriveProtection({
  items = [],
  importableIds = [],
  syncMode,
  rules = [],
  now = new Date(),
} = {}) {
  const mode = normalizeSmartSyncMode(syncMode);
  const importable = new Set((Array.isArray(importableIds) ? importableIds : []).map(String));

  let sourceFileIds = [];
  if (mode === 'protect_everything_that_fits') {
    sourceFileIds = [...importable];
  } else if (mode === 'protect_important') {
    sourceFileIds = items
      .filter(item => importable.has(String(item?.id || item?.fileId || '')))
      .filter(item => driveItemMatchesImportant(item, rules, now))
      .map(item => String(item.id || item.fileId));
  }

  const selected = new Set(sourceFileIds);
  return {
    syncMode: mode,
    sourceFileIds,
    indexedOnlyItems: [...importable].filter(id => !selected.has(id)).length,
    indexedItems: importable.size,
  };
}
