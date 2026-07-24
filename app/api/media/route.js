import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { listUserMedia } from '@/lib/media-library-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const db = await getDb();
  const items = await listUserMedia({
    db,
    userId: user.id,
    filter: url.searchParams.get('filter') || 'all',
    query: url.searchParams.get('q') || '',
    limit: 500,
  });
  return NextResponse.json({ items });
}
