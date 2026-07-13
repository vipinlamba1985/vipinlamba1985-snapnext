import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { memoryBrainOverview, searchMemoryBrain } from '@/lib/memory-brain';
import { loadMemoryContext, resolveQueryContext } from '@/lib/memory-context';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

async function loadUserMedia(db, userId) {
  return db.collection('media')
    .find({ userId, trashed: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(2000)
    .toArray();
}

export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const db = await getDb();
    const [items, context] = await Promise.all([loadUserMedia(db, user.id), loadMemoryContext(db, user.id)]);
    const overview = memoryBrainOverview(items);
    return json({
      ...overview,
      confirmedRelationships: context.relationships.map(({ _id, userId, ...item }) => item),
      confirmedEvents: context.events.map(({ _id, userId, ...item }) => item),
      grounded: true,
      creditsUsed: 0,
      privacy: 'Built only from the authenticated user’s private library and labels they confirmed.',
    });
  } catch (error) {
    console.error('[memory-brain] overview failed', error?.message);
    return json({ error: 'Memory Brain overview is temporarily unavailable.' }, 500);
  }
}

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const query = String(body.query || '').trim();
    if (!query) return json({ error: 'Query is required' }, 400);
    if (query.length > 1200) return json({ error: 'Please shorten the search request.' }, 400);

    const db = await getDb();
    const [items, context] = await Promise.all([loadUserMedia(db, user.id), loadMemoryContext(db, user.id)]);
    const resolved = resolveQueryContext(query, context);
    const limit = Math.min(50, Math.max(1, Number(body.limit) || 12));
    const result = searchMemoryBrain(items, resolved.expandedQuery, { limit: Math.max(limit, 30) });

    const confirmedIds = new Set(resolved.matchedEvents.flatMap((event) => event.memoryIds || []));
    const matches = [...result.matches]
      .sort((a, b) => Number(confirmedIds.has(b.id)) - Number(confirmedIds.has(a.id)) || b.relevanceScore - a.relevanceScore)
      .slice(0, limit)
      .map((item) => confirmedIds.has(item.id)
        ? { ...item, reasons: ['confirmed event', ...(item.reasons || [])].slice(0, 5), confidence: Math.max(item.confidence || 0, 95) }
        : item);

    return json({
      ...result,
      matches,
      queryContext: {
        relationships: resolved.matchedRelationships,
        events: resolved.matchedEvents.map(({ memoryIds, ...event }) => ({ ...event, memoryCount: memoryIds.length })),
      },
      grounded: true,
      creditsUsed: 0,
      indexedMemories: items.length,
    });
  } catch (error) {
    console.error('[memory-brain] search failed', error?.message);
    return json({ error: 'Memory Brain search is temporarily unavailable.' }, 500);
  }
}
