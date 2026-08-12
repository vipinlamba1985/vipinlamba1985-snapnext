import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(doc) {
  if (!doc) return doc;
  const { _id, passwordHash, ...rest } = doc;
  return rest;
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const all = await db.collection('media')
    .find({ userId: user.id, trashed: { $ne: true } })
    .sort({ createdAt: -1 })
    .toArray();

  const groups = {};
  const onThisDay = [];
  const today = new Date();
  for (const media of all) {
    const date = new Date(media.createdAt);
    if (!Number.isFinite(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!groups[key]) {
      groups[key] = {
        key,
        label: date.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        items: [],
      };
    }
    const safe = clean(media);
    groups[key].items.push(safe);
    if (date.getMonth() === today.getMonth() && date.getDate() === today.getDate() && date.getFullYear() !== today.getFullYear()) {
      onThisDay.push(safe);
    }
  }

  const groupList = Object.values(groups);
  const stories = groupList
    .filter((group) => group.items?.some((item) => ['photo', 'video'].includes(item.kind)))
    .slice(0, 8)
    .map((group) => {
      const cover = group.items.find((item) => ['photo', 'video'].includes(item.kind));
      return {
        ...cover,
        storyKey: group.key,
        title: group.label,
        count: group.items.filter((item) => ['photo', 'video'].includes(item.kind)).length,
      };
    });

  return NextResponse.json(
    { groups: groupList, onThisDay, stories },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );
}
