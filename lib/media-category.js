export const MEDIA_CATEGORIES = ['photos', 'videos', 'screenshots', 'docs'];
export const SCREENSHOT_TYPES = ['visual', 'info', 'docs'];

const SCREENSHOT_FILENAME = /(^|[\s_.-])(screenshot|screen[\s_-]?shot|screen[\s_-]?recording|capture|snip)([\s_.-]|$)/i;
const IOS_SCREENSHOT_FILENAME = /^img_[0-9]{4,}\.(png|heic|jpg|jpeg)$/i;
const DOCUMENT_FILENAME = /(^|[\s_.-])(receipt|invoice|statement|boarding[\s_-]?pass|passport|ticket|document|scan|contract|form|bill|certificate|license|licence|visa|permit|insurance|tax)([\s_.-]|$)/i;

const DOC_EVIDENCE = /\b(passport|driver'?s? license|driving licence|national id|identity card|visa|permit|certificate|invoice|receipt|bank statement|statement|tax|insurance|medical report|lab report|prescription|boarding pass|contract|official letter|application form|payment confirmation)\b/i;
const VISUAL_EVIDENCE = /\b(instagram|facebook|pinterest|tiktok|reel|story|meme|artwork|illustration|fashion|outfit|design|inspiration|product image|travel photo|wallpaper|poster|photograph|photo)\b/i;
const STRONG_SCREEN_EVIDENCE = /\b(screenshot|screen capture|app interface|website interface|chat message|text message|notification|status bar|navigation bar|menu button|browser tab|social media post|user interface|\bui\b)\b/i;

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

function analysisText(item = {}) {
  return [
    item.name,
    item.aiAnalysis?.description,
    item.aiAnalysis?.textInside,
    item.aiAnalysis?.autoAlbum,
    ...(item.aiAnalysis?.tags || []),
    ...(item.userTags || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function isScreenshotMedia(item = {}) {
  if (item.kind === 'video' || item.kind === 'text' || item.kind === 'document') return false;

  // User correction is the strongest signal. Once a user says a memory is a photo,
  // AI is not allowed to move it back into Screenshots.
  const userCategory = String(item.userCategory || '').trim().toLowerCase();
  if (userCategory === 'photos') return false;
  if (userCategory === 'screenshots') return true;

  const name = String(item.name || '').trim();
  if (SCREENSHOT_FILENAME.test(name)) return true;

  const text = analysisText(item);
  const contentType = normalizedContentType(item);
  const confidence = contentTypeConfidence(item);

  // A model label alone is not enough. Require very high confidence plus independent
  // screen/UI evidence so normal still photos are not pulled into Screenshots.
  if (confidence >= 0.9 && ['screenshot', 'screen_capture', 'screen capture'].includes(contentType) && STRONG_SCREEN_EVIDENCE.test(text)) return true;

  // Generic iPhone IMG_ filenames are common camera photos too, so filename pattern
  // must be backed by strong screen evidence and high model confidence.
  if (IOS_SCREENSHOT_FILENAME.test(name) && confidence >= 0.85 && STRONG_SCREEN_EVIDENCE.test(text)) return true;
  return false;
}

export function suggestedScreenshotType(item = {}) {
  const text = analysisText(item);
  if (DOC_EVIDENCE.test(text) || DOCUMENT_FILENAME.test(String(item.name || ''))) {
    return { type: 'docs', confidence: 0.9, reason: 'Important document signals found' };
  }

  const textInside = String(item.aiAnalysis?.textInside || '').trim();
  if (VISUAL_EVIDENCE.test(text) && textInside.length < 160) {
    return { type: 'visual', confidence: 0.78, reason: 'Mostly visual reference content' };
  }

  return { type: 'info', confidence: 0.65, reason: 'Useful reference screenshot' };
}

export function screenshotType(item = {}) {
  const userChoice = String(item.userScreenshotType || '').trim().toLowerCase();
  if (SCREENSHOT_TYPES.includes(userChoice)) {
    return { type: userChoice, source: 'user', confidence: 1, reason: 'Chosen by you' };
  }

  const stored = String(item.screenshotType || '').trim().toLowerCase();
  if (SCREENSHOT_TYPES.includes(stored)) {
    return {
      type: stored,
      source: String(item.screenshotTypeSource || 'suggested'),
      confidence: Number(item.screenshotTypeConfidence || 0.7),
      reason: item.screenshotTypeReason || 'SnapNext suggestion',
    };
  }

  if (String(item.userCategory || '').toLowerCase() === 'docs' && isScreenshotMedia({ ...item, userCategory: 'screenshots' })) {
    return { type: 'docs', source: 'user', confidence: 1, reason: 'Previously placed in Docs' };
  }

  const suggestion = suggestedScreenshotType(item);
  return { ...suggestion, source: 'suggested' };
}

export function isDocsItem(item = {}) {
  if (item.kind === 'text' || item.kind === 'document') return true;
  if (isScreenshotMedia(item)) return screenshotType(item).type === 'docs';
  return String(item.userCategory || '').trim().toLowerCase() === 'docs';
}

export function mediaCategory(item = {}) {
  if (item.kind === 'video') return 'videos';
  if (item.kind === 'text' || item.kind === 'document') return 'docs';

  const userCategory = String(item.userCategory || '').trim().toLowerCase();
  if (MEDIA_CATEGORIES.includes(userCategory) && userCategory !== 'screenshots') return userCategory;
  if (isScreenshotMedia(item)) return 'screenshots';
  if (userCategory === 'screenshots') return 'screenshots';

  const contentType = normalizedContentType(item);
  const confidence = contentTypeConfidence(item);
  if (confidence >= 0.6) {
    if (['document', 'receipt', 'invoice', 'form', 'scan', 'pdf'].includes(contentType)) return 'docs';
    if (['photo', 'image', 'photograph'].includes(contentType)) return 'photos';
  }

  if (DOCUMENT_FILENAME.test(String(item.name || ''))) return 'docs';
  return 'photos';
}

export function mediaUserTags(item = {}) {
  return Array.isArray(item.userTags) ? item.userTags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean) : [];
}

export function needsMediaClassification(item = {}) {
  if (MEDIA_CATEGORIES.includes(String(item.userCategory || '').toLowerCase())) return false;
  if (item.kind !== 'photo') return false;
  if (isScreenshotMedia(item) || DOCUMENT_FILENAME.test(String(item.name || ''))) return false;
  return !normalizedContentType(item) || contentTypeConfidence(item) < 0.6;
}
