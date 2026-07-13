import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { memoryBrainOverview, searchMemoryBrain } from '@/lib/memory-brain';

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
    const items = await loadUserMedia(db, user.id);
    const overview = memoryBrainOverview(items);
    return json({
      ...overview,
      grounded: true,
      creditsUsed: 0,
      privacy: 'Built only from the authenticated user’s private SnapNext library.',
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
    const items = await loadUserMedia(db, user.id);
    const result = searchMemoryBrain(items, query, { limit: Math.min(50, Math.max(1, Number(body.limit) || 12)) });
    return json({
      ...result,
      grounded: true,
      creditsUsed: 0,
      indexedMemories: items.length,
    });
  } catch (error) {
    console.error('[memory-brain] search failed', error?.message);
    return json({ error: 'Memory Brain search is temporarily unavailable.' }, 500);
  }
}
