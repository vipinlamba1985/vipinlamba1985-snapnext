export function clampNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : fallback;
  return Math.max(min, Math.min(max, safe));
}

export function sanitizeThumbnailCrop(value = {}) {
  const crop = value && typeof value === 'object' ? value : {};
  return {
    x: Math.round(clampNumber(crop.x, -45, 45, 0) * 100) / 100,
    y: Math.round(clampNumber(crop.y, -45, 45, 0) * 100) / 100,
    zoom: Math.round(clampNumber(crop.zoom, 0.65, 2.25, 1) * 100) / 100,
  };
}

function roundedPercent(value) {
  return Math.round(clampNumber(value, 0, 100, 50) * 100) / 100;
}

/**
 * Produce a safe CSS-only face focus. The image always remains a normal
 * object-cover element that fills the card; zoom is applied around the AWS
 * face point. This deliberately avoids absolute pixel crop calculations,
 * which can move the whole image outside the viewport on mobile Safari.
 */
export function safeFaceFocus(faceBox = {}, manualCrop = {}) {
  const crop = sanitizeThumbnailCrop(manualCrop);
  const width = clampNumber(faceBox?.Width, 0.01, 1, 0.2);
  const height = clampNumber(faceBox?.Height, 0.01, 1, 0.2);
  const left = clampNumber(faceBox?.Left, 0, 1 - width, 0.4);
  const top = clampNumber(faceBox?.Top, 0, 1 - height, 0.3);

  const faceCenterX = (left + width / 2) * 100;
  const faceCenterY = (top + height / 2) * 100;
  const x = roundedPercent(faceCenterX + crop.x);
  const y = roundedPercent(faceCenterY + crop.y);
  const faceSize = Math.max(width, height, 0.01);

  // A face should occupy roughly 58% of the card. Caps keep very tiny faces
  // usable without creating extreme transforms. No Rekognition call is made.
  const automaticZoom = clampNumber(0.58 / faceSize, 1.05, 5.5, 1.5);
  const zoom = clampNumber(automaticZoom * crop.zoom, 1, 8, automaticZoom);
  const focusPoint = `${x}% ${y}%`;

  return {
    crop,
    automaticZoom,
    zoom: Math.round(zoom * 1000) / 1000,
    objectPosition: focusPoint,
    transformOrigin: focusPoint,
    center: { x, y },
  };
}
