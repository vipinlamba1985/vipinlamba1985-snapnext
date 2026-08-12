'use client';

import { isPreviewDemo, mediaSrc } from './api-client';

export function galleryThumbnailSrc(id, width = 480) {
  if (isPreviewDemo()) return mediaSrc(id);
  const size = Math.min(1200, Math.max(240, Number.parseInt(width, 10) || 480));
  return `/api/media/${encodeURIComponent(id)}/thumbnail?w=${size}`;
}
