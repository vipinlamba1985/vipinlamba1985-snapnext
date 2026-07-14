import { searchMemoryBrain } from '@/lib/memory-brain';
import { loadMemoryContext, resolveQueryContext } from '@/lib/memory-context';
import { getLearningProfile } from '@/lib/learning-engine';
import { persistMemoryGraph } from '@/lib/persistent-memory-graph';
import { reconcileMediaLibraryEvent } from '@/lib/intelligence-event-bus';

function safePreferences(profile) {
  if (!profile || profile.learningEnabled === false) return {};
  const preferences = profile.preferences || {};
  const confidence = profile.confidence || {};
  return Object.fromEntries(Object.entries(preferences).filter(([key]) => Number(confidence[key] || 0) >= 50));
}

export async function buildLifeIntelligenceContext(db, userId, query, options = {}) {
  const mediaLimit = Math.min(2000, Math.max(100, Number(options.mediaLimit) || 1000));
  const matchLimit = Math.min(50, Math.max(1, Number(options.matchLimit) || 12));
  const [items, memoryContext, learningProfile] = await Promise.all([
    db.collection('media').find({ userId, trashed: { $ne: true } }).sort({ createdAt: -1 }).limit(mediaLimit).toArray(),
    loadMemoryContext(db, userId),
    getLearningProfile(db, userId),
  ]);

  await reconcileMediaLibraryEvent(db, userId, items);
  const resolved = resolveQueryContext(query, memoryContext);
  const search = searchMemoryBrain(items, resolved.expandedQuery, { limit: Math.max(matchLimit, 30) });
  const confirmedIds = new Set(resolved.matchedEvents.flatMap((event) => event.memoryIds || []));
  const matches = [...search.matches]
    .sort((a, b) => Number(confirmedIds.has(b.id)) - Number(confirmedIds.has(a.id)) || b.relevanceScore - a.relevanceScore)
    .slice(0, matchLimit)
    .map((item) => confirmedIds.has(item.id)
      ? { ...item, reasons: ['confirmed event', ...(item.reasons || [])].slice(0, 5), confidence: Math.max(item.confidence || 0, 95) }
      : item);

  const graph = await persistMemoryGraph(db, userId, items, memoryContext);
  const queryContext = {
    relationships: resolved.matchedRelationships,
    events: resolved.matchedEvents.map(({ memoryIds, ...event }) => ({ ...event, memoryCount: memoryIds.length })),
    preferences: safePreferences(learningProfile),
  };

  return {
    items,
    matches,
    search,
    resolved,
    queryContext,
    learningProfile,
    graph: { version: graph.version, totals: graph.totals, cached: !!graph.cached, updatedAt: graph.updatedAt || graph.generatedAt },
    recentMemories: items.slice(0, 12).map((item) => ({ id: item.id, kind: item.kind, createdAt: item.createdAt, favorite: !!(item.favorite || item.isFavorite) })),
    creditsUsed: 0,
  };
}

export function contextPromptSummary(context) {
  return {
    confirmedRelationships: context.queryContext.relationships,
    confirmedEvents: context.queryContext.events,
    preferences: context.queryContext.preferences,
    graphTotals: context.graph.totals,
  };
}
