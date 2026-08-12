export const DEFAULT_GALLERY_BATCH_SIZE = 60;
export const MAX_GALLERY_RESTORE_ITEMS = 1200;
export const MAX_GALLERY_SCROLL_Y = 20_000_000;

export function clampGalleryBatchSize(value, fallback = DEFAULT_GALLERY_BATCH_SIZE) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(200, Math.max(20, parsed));
}

export function createGalleryWindow(items, visibleCount) {
  const source = Array.isArray(items) ? items : [];
  const count = Math.min(source.length, Math.max(0, Number(visibleCount) || 0));
  return {
    items: source.slice(0, count),
    visibleCount: count,
    totalCount: source.length,
    hasMore: count < source.length,
    remaining: Math.max(0, source.length - count),
  };
}

export function nextGalleryVisibleCount(current, total, batchSize = DEFAULT_GALLERY_BATCH_SIZE) {
  const batch = clampGalleryBatchSize(batchSize);
  return Math.min(Math.max(0, Number(total) || 0), Math.max(0, Number(current) || 0) + batch);
}

export function gallerySessionKey({ filter = 'all', search = '' } = {}) {
  return `snapnext:gallery:v3:${String(filter)}:${String(search).trim().toLowerCase()}`;
}

export function normalizeGallerySessionState(value = {}) {
  const rawScroll = Number(value?.scrollY);
  const rawCount = Number(value?.loadedCount);
  const scrollY = Number.isFinite(rawScroll) ? Math.min(MAX_GALLERY_SCROLL_Y, Math.max(0, Math.round(rawScroll))) : 0;
  const actualLoadedCount = Number.isFinite(rawCount) ? Math.max(0, Math.round(rawCount)) : 0;
  return {
    scrollY,
    loadedCount: Math.min(MAX_GALLERY_RESTORE_ITEMS, actualLoadedCount),
    wasCapped: actualLoadedCount > MAX_GALLERY_RESTORE_ITEMS,
  };
}

export function galleryRestoreNeedsMore({ target, loadedCount, hasMore, nextCursor, loading, loadingMore } = {}) {
  const normalized = normalizeGallerySessionState(target);
  return Boolean(
    !loading
    && !loadingMore
    && hasMore
    && nextCursor
    && Math.max(0, Number(loadedCount) || 0) < normalized.loadedCount
  );
}
