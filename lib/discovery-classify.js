const SCREENSHOT_WORDS = ['screenshot', 'screen shot', 'screen_recording', 'screen-recording'];
const DOCUMENT_WORDS = ['scan', 'receipt', 'invoice', 'document', 'passport', 'ticket', 'statement'];
const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'tif', 'tiff']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'avi', 'webm', 'mkv', '3gp', '3g2', 'mts', 'm2ts']);

function extensionOf(file) {
  const name = String(file?.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}

export function isDiscoverableFile(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/')) return true;
  const extension = extensionOf(file);
  return PHOTO_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension);
}

export function classifyLocalFile(file) {
  const lower = String(file.name || '').toLowerCase();
  const extension = extensionOf(file);
  const kind = String(file.type || '').startsWith('video/') || VIDEO_EXTENSIONS.has(extension) ? 'video' : 'photo';
  return {
    localId: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    file,
    name: file.name,
    size: file.size,
    mime: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    kind,
    captureDate: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    screenshot: SCREENSHOT_WORDS.some((word) => lower.includes(word)),
    document: DOCUMENT_WORDS.some((word) => lower.includes(word)),
  };
}

export function buildDiscoveryReport(items = []) {
  const dates = items.map((item) => item.captureDate).filter(Boolean).sort();
  return {
    total: items.length,
    photos: items.filter((item) => item.kind === 'photo').length,
    videos: items.filter((item) => item.kind === 'video').length,
    screenshots: items.filter((item) => item.screenshot).length,
    documents: items.filter((item) => item.document).length,
    bytes: items.reduce((sum, item) => sum + item.size, 0),
    dateFrom: dates[0] || null,
    dateTo: dates[dates.length - 1] || null,
  };
}
