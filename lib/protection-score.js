export function protectionScore(item, priorityType = 'best_of_life') {
  let value = item.kind === 'photo' ? 70 : 58;
  if (item.screenshot) value -= 32;
  if (item.document) value -= 24;
  if (item.kind === 'photo' && item.size < 12 * 1024 * 1024) value += 8;
  if (item.kind === 'video' && item.size < 150 * 1024 * 1024) value += 6;
  if (priorityType === 'best_of_life' && !item.screenshot && !item.document) value += 10;
  if (priorityType === 'self') value += item.kind === 'photo' ? 5 : 2;
  if (priorityType === 'person' || priorityType === 'together') value += 4;
  return value;
}

export function discoveryMonth(item) {
  const date = item.captureDate ? new Date(item.captureDate) : null;
  if (!date || Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
