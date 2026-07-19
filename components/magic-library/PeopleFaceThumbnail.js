'use client';

import { useMemo, useState } from 'react';
import { mediaSrc } from '@/lib/api-client';

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

export default function PeopleFaceThumbnail({ mediaId, faceBox, className = '', manual = {}, alt = '' }) {
  const [failed, setFailed] = useState(false);
  const objectPosition = useMemo(() => facePosition(faceBox, manual), [faceBox, manual]);
  const zoom = clamp(Number(manual.zoom || 1), 0.9, 1.35);

  if (!mediaId || failed) {
    return <span className={`grid place-items-center bg-white/5 font-black text-white/50 ${className}`}>?</span>;
  }

  return <span className={`relative block overflow-hidden bg-white/5 ${className}`}>
    <img
      src={mediaSrc(mediaId)}
      alt={alt}
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
      style={{ objectPosition, transform: `scale(${zoom})`, transformOrigin: objectPosition }}
    />
  </span>;
}
