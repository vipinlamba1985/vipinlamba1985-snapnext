const GENERIC_PERSON_LABELS = new Set([
  'person','people','user','face','unknown','man','woman','male','female','boy','girl','child','kid','baby',
  'mother','mom','father','dad','son','daughter','bride','groom','helper','friend','family','adult','older woman',
  'young woman','middle-aged woman','middle aged woman','older man','young man','middle-aged man','middle aged man'
]);

function validIdentity(value) {
  if (typeof value !== 'string') return false;
  const clean = value.trim();
  if (!clean) return false;
  const lower = clean.toLowerCase();
  if (GENERIC_PERSON_LABELS.has(lower)) return false;
  if (/^person\s*\d+$/i.test(clean)) return false;
  return true;
}

export function mediaPersonLabels(item = {}) {
  const analysis = item.aiAnalysis || {};
  const explicit = [
    ...(Array.isArray(item.people_tags) ? item.people_tags : []),
    ...(Array.isArray(item.people) ? item.people : []),
  ];
  const inferred = [
    ...(Array.isArray(analysis.people) ? analysis.people : []),
    ...(Array.isArray(analysis.faces) ? analysis.faces : []),
  ];
  const source = explicit.filter(validIdentity).length ? explicit : inferred;
  return Array.from(new Set(source.filter(validIdentity).map((value) => value.trim())));
}

export function mediaSearchText(item = {}) {
  const analysis = item.aiAnalysis || {};
  return [
    item.name,
    analysis.description,
    analysis.textInside,
    analysis.autoAlbum,
    ...(Array.isArray(analysis.tags) ? analysis.tags : []),
    ...(Array.isArray(analysis.locations) ? analysis.locations : []),
    ...mediaPersonLabels(item),
  ].filter(Boolean).join(' ').toLowerCase();
}
