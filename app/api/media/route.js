import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { listUserMediaPage } from '@/lib/media-library-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const db = await getDb();
  const page = await listUserMediaPage({
    db,
    userId: user.id,
    filter: url.searchParams.get('filter') || 'all',
    query: url.searchParams.get('q') || '',
    cursor: url.searchParams.get('cursor') || '',
    limit: url.searchParams.get('limit') || 48,
  });
  return NextResponse.json(page);
}
