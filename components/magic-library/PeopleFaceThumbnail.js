'use client';

import { useMemo, useRef, useState } from 'react';
import { getToken } from '@/lib/api-client';
import { automaticFaceFocus, sanitizeThumbnailCrop } from '@/lib/people-thumbnail';

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
  const drag = useRef(null);
  const focus = useMemo(() => automaticFaceFocus(faceBox, manual), [faceBox, manual]);
  const src = useMemo(() => thumbnailSrc(mediaId), [mediaId]);

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
      crop: focus.crop,
      zoom: Math.max(1, focus.zoom),
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
      // Object-position moves opposite to the dragged image, so subtracting
      // keeps the interaction natural: drag the photo where you want it.
      x: state.crop.x - (dx / state.width) * (100 / state.zoom),
      y: state.crop.y - (dy / state.height) * (100 / state.zoom),
    }));
  }

  if (!src || failed) {
    return <span className={`grid place-items-center bg-white/5 font-black text-white/50 ${className}`}>?</span>;
  }

  return <span
    className={`block overflow-hidden bg-white/5 ${editable ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${className}`}
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
      onError={() => setFailed(true)}
      className="block h-full w-full select-none object-cover"
      style={{
        objectPosition: focus.objectPosition,
        transform: `scale(${focus.zoom})`,
        transformOrigin: focus.objectPosition,
      }}
    />
  </span>;
}
