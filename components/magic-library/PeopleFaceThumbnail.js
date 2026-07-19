'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getToken } from '@/lib/api-client';
import { calculateFaceCropLayout, sanitizeThumbnailCrop } from '@/lib/people-thumbnail';

function thumbnailSrc(mediaId) {
  const token = getToken();
  if (!mediaId || !token || token === 'preview-demo-token') return '';
  return `/api/media/${encodeURIComponent(mediaId)}/thumbnail?t=${encodeURIComponent(token)}`;
}

export default function PeopleFaceThumbnail({
  mediaId,
  faceBox,
  className = '',
  manual = {},
  alt = '',
  editable = false,
  onManualChange,
}) {
  const [failed, setFailed] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const containerRef = useRef(null);
  const drag = useRef(null);
  const src = useMemo(() => thumbnailSrc(mediaId), [mediaId]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    function updateViewport() {
      const rect = node.getBoundingClientRect();
      setViewport({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    }

    updateViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewport);
      return () => window.removeEventListener('resize', updateViewport);
    }

    const observer = new ResizeObserver(updateViewport);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!imageSize.width || !imageSize.height || !viewport.width || !viewport.height) return null;
    return calculateFaceCropLayout({
      faceBox,
      manualCrop: manual,
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      containerWidth: viewport.width,
      containerHeight: viewport.height,
    });
  }, [faceBox, imageSize, manual, viewport]);

  function finishDrag(event) {
    if (!drag.current) return;
    try { event.currentTarget.releasePointerCapture(drag.current.pointerId); } catch {}
    drag.current = null;
  }

  function onPointerDown(event) {
    if (!editable || !onManualChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      crop: sanitizeThumbnailCrop(manual),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId || !onManualChange) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    onManualChange(sanitizeThumbnailCrop({
      ...state.crop,
      x: state.crop.x + (dx / state.width) * 100,
      y: state.crop.y + (dy / state.height) * 100,
    }));
  }

  if (!src || failed) {
    return <span className={`grid place-items-center bg-white/5 font-black text-white/50 ${className}`}>?</span>;
  }

  const imageStyle = layout ? {
    position: 'absolute',
    width: `${layout.width}px`,
    height: `${layout.height}px`,
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    maxWidth: 'none',
  } : {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  return <span
    ref={containerRef}
    className={`relative block overflow-hidden bg-white/5 ${editable ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${className}`}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={finishDrag}
    onPointerCancel={finishDrag}
  >
    <img
      src={src}
      alt={alt}
      draggable={false}
      decoding="async"
      onLoad={(event) => setImageSize({
        width: event.currentTarget.naturalWidth,
        height: event.currentTarget.naturalHeight,
      })}
      onError={() => setFailed(true)}
      className="select-none"
      style={imageStyle}
    />
  </span>;
}
