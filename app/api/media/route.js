import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { listUserMedia } from '@/lib/media-library-service';
import { listGalleryPage } from '@/lib/gallery-pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const db = await getDb();

  if (url.searchParams.get('view') === 'gallery') {
    try {
      const page = await listGalleryPage({
        db,
        userId: user.id,
        filter: url.searchParams.get('filter') || 'all',
        query: url.searchParams.get('q') || '',
        cursor: url.searchParams.get('cursor') || '',
        limit: url.searchParams.get('limit') || undefined,
      });
      return NextResponse.json(page);
    } catch (error) {
      const status = Number(error?.status) || 500;
      return NextResponse.json({
        error: error?.message || 'Library could not load.',
        code: error?.code || 'media_gallery_failed',
      }, { status });
    }
  }

  // Keep the existing bounded response for older callers. Gallery uses the
  // explicit paged contract above so no unrelated surface changes behavior.
  const items = await listUserMedia({
    db,
    userId: user.id,
    filter: url.searchParams.get('filter') || 'all',
    query: url.searchParams.get('q') || '',
    limit: 500,
  });
  return NextResponse.json({ items });
}
