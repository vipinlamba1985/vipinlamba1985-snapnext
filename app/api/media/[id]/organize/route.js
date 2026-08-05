import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { MEDIA_CATEGORIES, SCREENSHOT_TYPES } from '@/lib/media-category';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const set = {};
  const pull = {};

  if (body.category !== undefined) {
    const category = String(body.category || '').trim().toLowerCase();
    if (!MEDIA_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    set.userCategory = category;
  }

  if (body.screenshotType !== undefined) {
    const screenshotType = String(body.screenshotType || '').trim().toLowerCase();
    if (!SCREENSHOT_TYPES.includes(screenshotType)) {
      return NextResponse.json({ error: 'Invalid screenshot type' }, { status: 400 });
    }
    set.userScreenshotType = screenshotType;
    set.screenshotTypeSource = 'user';
    set.screenshotTypeConfidence = 1;
    set.screenshotTypeReason = 'Chosen by user';
  }

  if (body.tags !== undefined) {
    const tags = Array.isArray(body.tags)
      ? Array.from(new Set(body.tags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean))).slice(0, 30)
      : [];
    set.userTags = tags;
  }

  if (body.removeConfirmedPersonClusterId !== undefined) {
    const clusterId = String(body.removeConfirmedPersonClusterId || '').trim();
    if (!clusterId || clusterId.length > 120 || /[\u0000-\u001f\u007f]/.test(clusterId)) {
      return NextResponse.json({ error: 'Invalid person assignment' }, { status: 400 });
    }
    pull.userConfirmedPeople = { clusterId };
  }

  if (!Object.keys(set).length && !Object.keys(pull).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  set.updatedAt = new Date();
  const update = { $set: set };
  if (Object.keys(pull).length) update.$pull = pull;

  const db = await getDb();
  const result = await db.collection('media').findOneAndUpdate(
    { id, userId: user.id, trashed: { $ne: true } },
    update,
    { returnDocument: 'after' },
  );

  if (!result) return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
  const { _id, ...item } = result;
  return NextResponse.json({ ok: true, item });
}
