export function buildProtectionPlan(items, availableBytes) {
  return { selected: items, outside: [], targetBytes: availableBytes, usedBytes: items.reduce((sum, item) => sum + item.size, 0) };
}
