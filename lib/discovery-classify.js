const SCREENSHOT_WORDS = ['screenshot', 'screen shot', 'screen_recording', 'screen-recording'];
const DOCUMENT_WORDS = ['scan', 'receipt', 'invoice', 'document', 'passport', 'ticket', 'statement'];

export function classifyLocalFile(file) {
  const lower = String(file.name || '').toLowerCase();
  const kind = file.type?.startsWith('video/') ? 'video' : 'photo';
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
