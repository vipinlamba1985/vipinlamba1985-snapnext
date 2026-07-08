export const MEDIA_CATEGORIES = ['photos', 'videos', 'screenshots', 'docs'];

const SCREENSHOT_FILENAME = /(^|[\s_.-])(screenshot|screen[\s_-]?shot|screen[\s_-]?recording)([\s_.-]|$)/i;
const DOCUMENT_FILENAME = /(^|[\s_.-])(receipt|invoice|statement|boarding[\s_-]?pass|passport|ticket|document|scan)([\s_.-]|$)/i;

export function mediaCategory(item = {}) {
  if (MEDIA_CATEGORIES.includes(item.userCategory)) return item.userCategory;
  if (item.kind === 'video') return 'videos';
  if (item.kind === 'text') return 'docs';

  const analysis = item.aiAnalysis || {};
  const contentType = String(analysis.contentType || '').toLowerCase();
  const confidence = Number(analysis.contentTypeConfidence || 0);

  if (confidence >= 0.6) {
    if (contentType === 'screenshot') return 'screenshots';
    if (contentType === 'document') return 'docs';
    if (contentType === 'photo') return 'photos';
  }

  const name = String(item.name || '');
  if (SCREENSHOT_FILENAME.test(name)) return 'screenshots';
  if (DOCUMENT_FILENAME.test(name)) return 'docs';

  return 'photos';
}

export function mediaUserTags(item = {}) {
  return Array.isArray(item.userTags) ? item.userTags.filter(Boolean) : [];
}

export function needsMediaClassification(item = {}) {
  if (item.userCategory) return false;
  if (item.kind !== 'photo') return false;
  return !item.aiAnalysis?.contentType || Number(item.aiAnalysis?.contentTypeConfidence || 0) < 0.6;
}
