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

export function automaticFaceFocus(faceBox = {}, manualCrop = {}) {
  const width = clampNumber(faceBox?.Width, 0.01, 1, 0.2);
  const height = clampNumber(faceBox?.Height, 0.01, 1, 0.2);
  const left = clampNumber(faceBox?.Left, 0, 1 - width, 0.4);
  const top = clampNumber(faceBox?.Top, 0, 1 - height, 0.3);
  const crop = sanitizeThumbnailCrop(manualCrop);

  const centerX = (left + width / 2) * 100;
  const centerY = (top + height / 2) * 100;
  const faceSize = Math.max(width, height);

  // Aim for one clear head/face in the card. This reuses the AWS bounding box
  // and does not create another file or call Rekognition again.
  const automaticZoom = clampNumber(0.72 / faceSize, 1.15, 6.5, 1.5);
  const zoom = clampNumber(automaticZoom * crop.zoom, 1.05, 8, automaticZoom);
  const x = clampNumber(centerX + crop.x, 0, 100, centerX);
  const y = clampNumber(centerY + crop.y, 0, 100, centerY);

  return {
    crop,
    automaticZoom,
    zoom,
    objectPosition: `${x}% ${y}%`,
    center: { x, y },
  };
}
