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

export function calculateFaceCropLayout({
  faceBox = {},
  manualCrop = {},
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
  targetFaceFill = 0.72,
} = {}) {
  const sourceWidth = Math.max(1, Number(imageWidth || 1));
  const sourceHeight = Math.max(1, Number(imageHeight || 1));
  const viewportWidth = Math.max(1, Number(containerWidth || 1));
  const viewportHeight = Math.max(1, Number(containerHeight || 1));
  const crop = sanitizeThumbnailCrop(manualCrop);

  const width = clampNumber(faceBox?.Width, 0.01, 1, 0.2);
  const height = clampNumber(faceBox?.Height, 0.01, 1, 0.2);
  const left = clampNumber(faceBox?.Left, 0, 1 - width, 0.4);
  const top = clampNumber(faceBox?.Top, 0, 1 - height, 0.3);

  const faceCenterX = (left + width / 2) * sourceWidth;
  const faceCenterY = (top + height / 2) * sourceHeight;
  const facePixels = Math.max(width * sourceWidth, height * sourceHeight, 1);
  const targetPixels = Math.min(viewportWidth, viewportHeight) * clampNumber(targetFaceFill, 0.45, 0.9, 0.72);

  const coverScale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const faceScale = targetPixels / facePixels;
  const automaticScale = Math.max(coverScale, faceScale);
  const scale = clampNumber(automaticScale * crop.zoom, coverScale, coverScale * 8, automaticScale);

  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const requestedLeft = viewportWidth / 2 - faceCenterX * scale + (crop.x / 100) * viewportWidth;
  const requestedTop = viewportHeight / 2 - faceCenterY * scale + (crop.y / 100) * viewportHeight;

  // Keep the image covering the card even when the user drags aggressively.
  const renderedLeft = clampNumber(requestedLeft, viewportWidth - renderedWidth, 0, 0);
  const renderedTop = clampNumber(requestedTop, viewportHeight - renderedHeight, 0, 0);

  return {
    crop,
    width: renderedWidth,
    height: renderedHeight,
    left: renderedLeft,
    top: renderedTop,
    scale,
    coverScale,
    automaticZoom: automaticScale / coverScale,
  };
}
