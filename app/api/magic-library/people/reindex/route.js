import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { rebuildPeopleIntelligence } from '@/lib/people-intelligence.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  try {
    const result = await rebuildPeopleIntelligence({
      db,
      userId: user.id,
      limit: body.limit || 12,
      reset: body.reset === true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[people-intelligence] reindex failed', error?.name, error?.message);
    return NextResponse.json({
      error: error?.message || 'Could not build People Intelligence.',
      code: error?.code || error?.name || 'people_index_failed',
    }, { status: 503 });
  }
}
