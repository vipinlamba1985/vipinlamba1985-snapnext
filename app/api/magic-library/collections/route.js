import { NextResponse } from 'next/server';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { listDeterministicCollection } from '@/lib/magic-manifest.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const type = String(url.searchParams.get('type') || 'photos');
  const limit = Number(url.searchParams.get('limit') || 120);
  try {
    const db = await getDb();
    const items = await listDeterministicCollection({ db, userId: user.id, type, limit });
    const response = NextResponse.json({ ok: true, type, count: items.length, items });
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch (error) {
    console.error('[magic-collections] failed', error);
    return NextResponse.json({ error: 'Collection could not load.' }, { status: 500 });
  }
}
