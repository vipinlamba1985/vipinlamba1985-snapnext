export const MEDIA_CATEGORIES = ['photos', 'videos', 'screenshots', 'docs'];

function textOf(item = {}) {
  const analysis = item.aiAnalysis || {};
  return [
    item.name,
    analysis.autoAlbum,
    analysis.description,
    analysis.textInside,
    ...(analysis.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function mediaCategory(item = {}) {
  if (MEDIA_CATEGORIES.includes(item.userCategory)) return item.userCategory;
  if (item.kind === 'video') return 'videos';
  if (item.kind === 'text') return 'docs';
  const text = textOf(item);
  if (/screenshot|screen shot|screen_recording|screen-recording/.test(text)) return 'screenshots';
  if (/document|receipt|invoice|statement|form|pdf|scan|passport|ticket/.test(text)) return 'docs';
  return 'photos';
}

export function mediaUserTags(item = {}) {
  return Array.isArray(item.userTags) ? item.userTags.filter(Boolean) : [];
}
