import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { MEDIA_CATEGORIES } from '@/lib/media-category';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const update = {};

  if (body.category !== undefined) {
    const category = String(body.category || '').trim().toLowerCase();
    if (!MEDIA_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    update.userCategory = category;
  }

  if (body.tags !== undefined) {
    const tags = Array.isArray(body.tags)
      ? Array.from(new Set(body.tags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean))).slice(0, 30)
      : [];
    update.userTags = tags;
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  update.updatedAt = new Date();
  const db = await getDb();
  const result = await db.collection('media').findOneAndUpdate(
    { id, userId: user.id, trashed: { $ne: true } },
    { $set: update },
    { returnDocument: 'after' },
  );

  if (!result) return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
  const { _id, ...item } = result;
  return NextResponse.json({ ok: true, item });
}
