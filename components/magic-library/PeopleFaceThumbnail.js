'use client';

import { useMemo, useState } from 'react';
import { mediaSrc } from '@/lib/api-client';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function faceTransform(box, imageSize, manual = {}) {
  const width = clamp(box?.Width, 0.02, 1);
  const height = clamp(box?.Height, 0.02, 1);
  const left = clamp(box?.Left, 0, 1 - width);
  const top = clamp(box?.Top, 0, 1 - height);
  const imageWidth = Math.max(1, Number(imageSize.width || 1));
  const imageHeight = Math.max(1, Number(imageSize.height || 1));
  const faceCenterX = (left + width / 2) * imageWidth;
  const faceCenterY = (top + height / 2) * imageHeight;
  const targetFaceRatio = clamp(0.58 * Number(manual.zoom || 1), 0.42, 0.78);
  const scale = Math.max(1, Math.min(12, targetFaceRatio / Math.max(width, height)));
  const imageLeft = 50 - (faceCenterX / imageWidth) * 100 * scale + Number(manual.x || 0) * 0.2;
  const imageTop = 50 - (faceCenterY / imageHeight) * 100 * scale + Number(manual.y || 0) * 0.2;
  return {
    position: 'absolute',
    left: `${imageLeft}%`,
    top: `${imageTop}%`,
    width: `${scale * 100}%`,
    height: `${scale * 100}%`,
    maxWidth: 'none',
    objectFit: 'cover',
    transform: 'translate(-50%, -50%)',
    transformOrigin: 'center',
  };
}

export default function PeopleFaceThumbnail({ mediaId, faceBox, className = '', manual = {}, alt = '' }) {
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const style = useMemo(() => faceTransform(faceBox, imageSize, manual), [faceBox, imageSize, manual]);
  if (!mediaId || !faceBox) return <span className={`grid place-items-center bg-white/5 font-black text-white/50 ${className}`}>?</span>;
  return <span className={`relative block overflow-hidden bg-white/5 ${className}`}>
    <img src={mediaSrc(mediaId)} alt={alt} draggable={false} onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} style={style} />
  </span>;
}
