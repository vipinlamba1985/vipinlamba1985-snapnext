import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { VIDEO_POSTER_MAX_BYTES } from '@/lib/thumbnails';
import { storeVideoPoster } from '@/lib/thumbnails.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ALLOWED_POSTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = await getDb();
  const doc = await db.collection('media').findOne({
    id: String(id || ''),
    userId: user.id,
    trashed: { $ne: true },
  });

  if (!doc) return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  if (doc.kind !== 'video') return NextResponse.json({ error: 'Poster source is not a video' }, { status: 415 });

  const form = await request.formData();
  const poster = form.get('poster');
  if (!poster || typeof poster.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'Poster image is required' }, { status: 400 });
  }

  const contentType = String(poster.type || '').toLowerCase();
  if (contentType && !ALLOWED_POSTER_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'Poster image type is not supported' }, { status: 415 });
  }
  if (Number(poster.size || 0) > VIDEO_POSTER_MAX_BYTES) {
    return NextResponse.json({ error: 'Poster image is too large' }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await poster.arrayBuffer());
    if (buffer.length > VIDEO_POSTER_MAX_BYTES) {
      return NextResponse.json({ error: 'Poster image is too large' }, { status: 413 });
    }
    const stored = await storeVideoPoster({ doc, userId: user.id, buffer });
    return NextResponse.json({ ok: true, bytes: stored.buffer.length });
  } catch (error) {
    console.error('[video-poster] store failed', doc.id, error?.name, error?.message);
    return NextResponse.json({ error: 'Video poster could not be saved' }, { status: 422 });
  }
}
