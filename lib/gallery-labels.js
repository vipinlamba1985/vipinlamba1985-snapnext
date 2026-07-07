export function mediaPersonLabels(item = {}) {
  const analysis = item.aiAnalysis || {};
  const values = [
    ...(Array.isArray(item.people_tags) ? item.people_tags : []),
    ...(Array.isArray(item.people) ? item.people : []),
    ...(Array.isArray(analysis.people) ? analysis.people : []),
    ...(Array.isArray(analysis.faces) ? analysis.faces : []),
  ];
  return Array.from(new Set(values.filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean)));
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
