import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(doc) {
  if (!doc) return doc;
  const { _id, userId, ...safe } = doc;
  return safe;
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const [items, unread] = await Promise.all([
    db.collection('notifications')
      .find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray(),
    db.collection('notifications').countDocuments({ userId: user.id, read: false }),
  ]);

  return NextResponse.json(
    { items: items.map(clean), unread },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
