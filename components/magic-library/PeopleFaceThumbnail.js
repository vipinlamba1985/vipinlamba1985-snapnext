'use client';

import { useMemo, useState } from 'react';
import { getToken } from '@/lib/api-client';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function facePosition(box, manual = {}) {
  const width = clamp(box?.Width, 0.01, 1);
  const height = clamp(box?.Height, 0.01, 1);
  const left = clamp(box?.Left, 0, 1 - width);
  const top = clamp(box?.Top, 0, 1 - height);
  const x = clamp((left + width / 2) * 100 + Number(manual.x || 0) * 0.25, 0, 100);
  const y = clamp((top + height / 2) * 100 + Number(manual.y || 0) * 0.25, 0, 100);
  return `${x}% ${y}%`;
}

function thumbnailSrc(mediaId) {
  const token = getToken();
  if (!mediaId || !token || token === 'preview-demo-token') return '';
  return `/api/media/${encodeURIComponent(mediaId)}/thumbnail?t=${encodeURIComponent(token)}`;
}

export default function PeopleFaceThumbnail({ mediaId, faceBox, className = '', manual = {}, alt = '' }) {
  const [failed, setFailed] = useState(false);
  const objectPosition = useMemo(() => facePosition(faceBox, manual), [faceBox, manual]);
  const src = useMemo(() => thumbnailSrc(mediaId), [mediaId]);

  if (!src || failed) {
    return <span className={`grid place-items-center bg-white/5 font-black text-white/50 ${className}`}>?</span>;
  }

  return <span className={`block overflow-hidden bg-white/5 ${className}`}>
    <img
      src={src}
      alt={alt}
      draggable={false}
      decoding="async"
      onError={() => setFailed(true)}
      className="block h-full w-full object-cover"
      style={{ objectPosition }}
    />
  </span>;
}
