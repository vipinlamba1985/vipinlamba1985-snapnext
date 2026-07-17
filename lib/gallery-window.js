export const DEFAULT_GALLERY_BATCH_SIZE = 60;

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
