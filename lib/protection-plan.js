import { protectionScore } from '@/lib/protection-score';

export function buildProtectionPlan(items, availableBytes, priority = { type: 'best_of_life' }) {
  const targetBytes = Math.max(0, Math.floor(availableBytes * 0.98));
  const ranked = items.map((item) => ({ ...item, priorityScore: protectionScore(item, priority) })).sort((a, b) => b.priorityScore - a.priorityScore || a.size - b.size);
  const selected = [];
  const outside = [];
  let usedBytes = 0;
  for (const item of ranked) {
    if (usedBytes + item.size <= targetBytes) {
      selected.push(item);
      usedBytes += item.size;
    } else outside.push(item);
  }
  return { selected, outside, targetBytes, usedBytes };
}
