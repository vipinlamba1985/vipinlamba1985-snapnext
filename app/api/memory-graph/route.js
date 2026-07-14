import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { loadMemoryContext } from '@/lib/memory-context';
import { persistMemoryGraph } from '@/lib/persistent-memory-graph';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }

async function loadInputs(db, userId) {
  return Promise.all([
    db.collection('media').find({ userId, trashed: { $ne: true } }).sort({ createdAt: -1 }).limit(5000).toArray(),
    loadMemoryContext(db, userId),
  ]);
}

function publicGraph(snapshot) {
  return {
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    updatedAt: snapshot.updatedAt,
    cached: !!snapshot.cached,
    totals: snapshot.totals,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    grounded: true,
    creditsUsed: 0,
    privacy: 'Derived only from the authenticated user’s private memories and confirmed labels.',
  };
}

export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const db = await getDb();
    const [media, context] = await loadInputs(db, user.id);
    const snapshot = await persistMemoryGraph(db, user.id, media, context);
    return json(publicGraph(snapshot));
  } catch (error) {
    console.error('[memory-graph] load failed', error?.message);
    return json({ error: 'Memory Graph is temporarily unavailable.' }, 500);
  }
}

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const db = await getDb();
    await db.collection('memory_graph_snapshots').deleteOne({ userId: user.id });
    const [media, context] = await loadInputs(db, user.id);
    const snapshot = await persistMemoryGraph(db, user.id, media, context);
    return json({ ...publicGraph(snapshot), rebuilt: true });
  } catch (error) {
    console.error('[memory-graph] rebuild failed', error?.message);
    return json({ error: 'Memory Graph could not be rebuilt right now.' }, 500);
  }
}
