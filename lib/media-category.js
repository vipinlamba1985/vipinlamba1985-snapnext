export const MEDIA_CATEGORIES = ['photos', 'videos', 'screenshots', 'docs'];

const SCREENSHOT_FILENAME = /(^|[\s_.-])(screenshot|screen[\s_-]?shot|screen[\s_-]?recording|capture|snip)([\s_.-]|$)/i;
const IOS_SCREENSHOT_FILENAME = /^img_[0-9]{4,}\.(png|heic|jpg|jpeg)$/i;
const DOCUMENT_FILENAME = /(^|[\s_.-])(receipt|invoice|statement|boarding[\s_-]?pass|passport|ticket|document|scan|contract|form|bill)([\s_.-]|$)/i;

function normalizedContentType(item = {}) {
  const analysis = item.aiAnalysis || {};
  return String(
    analysis.contentType
      || analysis.mediaType
      || analysis.category
      || item.detectedCategory
      || '',
  ).trim().toLowerCase();
}

function contentTypeConfidence(item = {}) {
  const analysis = item.aiAnalysis || {};
  const value = Number(analysis.contentTypeConfidence ?? analysis.categoryConfidence ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function mediaCategory(item = {}) {
  const userCategory = String(item.userCategory || '').trim().toLowerCase();
  if (MEDIA_CATEGORIES.includes(userCategory)) return userCategory;

  if (item.kind === 'video') return 'videos';
  if (item.kind === 'text' || item.kind === 'document') return 'docs';

  const contentType = normalizedContentType(item);
  const confidence = contentTypeConfidence(item);
  if (confidence >= 0.6) {
    if (['screenshot', 'screen_capture', 'screen capture'].includes(contentType)) return 'screenshots';
    if (['document', 'receipt', 'invoice', 'form', 'scan', 'pdf'].includes(contentType)) return 'docs';
    if (['photo', 'image', 'photograph'].includes(contentType)) return 'photos';
  }

  const name = String(item.name || '').trim();
  if (SCREENSHOT_FILENAME.test(name)) return 'screenshots';

  // iPhone screenshots are often PNG files with IMG_#### names. Only use this as a weak
  // fallback when existing analysis also contains screen-like text, never for every IMG file.
  const analysisText = [
    item.aiAnalysis?.description,
    item.aiAnalysis?.textInside,
    ...(item.aiAnalysis?.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();
  if (IOS_SCREENSHOT_FILENAME.test(name) && /screen|app|website|message|menu|button|interface|ui/.test(analysisText)) return 'screenshots';

  if (DOCUMENT_FILENAME.test(name)) return 'docs';
  return 'photos';
}

export function mediaUserTags(item = {}) {
  return Array.isArray(item.userTags) ? item.userTags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean) : [];
}

export function needsMediaClassification(item = {}) {
  if (MEDIA_CATEGORIES.includes(String(item.userCategory || '').toLowerCase())) return false;
  if (item.kind !== 'photo') return false;
  if (SCREENSHOT_FILENAME.test(String(item.name || '')) || DOCUMENT_FILENAME.test(String(item.name || ''))) return false;
  return !normalizedContentType(item) || contentTypeConfidence(item) < 0.6;
}
