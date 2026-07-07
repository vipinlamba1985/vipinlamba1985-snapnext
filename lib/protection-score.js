export function protectionScore(item, priority = { type: 'best_of_life' }) {
  const priorityType = typeof priority === 'string' ? priority : priority.type;
  let value = item.kind === 'photo' ? 70 : 58;
  if (item.screenshot) value -= 32;
  if (item.document) value -= 24;
  if (item.kind === 'photo' && item.size < 12 * 1024 * 1024) value += 8;
  if (item.kind === 'video' && item.size < 150 * 1024 * 1024) value += 6;
  if (priorityType === 'best_of_life' && !item.screenshot && !item.document) value += 10;

  const clusters = new Set(item.personClusterIds || []);
  const hasSelf = priority.selfClusterId && clusters.has(priority.selfClusterId);
  const hasPerson = priority.personClusterId && clusters.has(priority.personClusterId);
  if (priorityType === 'self') value += hasSelf ? 90 : -8;
  if (priorityType === 'person') value += hasPerson ? 105 : -10;
  if (priorityType === 'together') {
    if (hasSelf && hasPerson) value += 140;
    else if (hasSelf || hasPerson) value += 20;
    else value -= 12;
  }
  return value;
}

export function discoveryMonth(item) {
  const date = item.captureDate ? new Date(item.captureDate) : null;
  if (!date || Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
