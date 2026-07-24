import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { ActivityApiError, parseNotificationReadRequest } from '@/lib/notifications-downloads-contract';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const { ids } = parseNotificationReadRequest(body);
    const db = await getDb();
    const filter = { userId: user.id };
    if (ids?.length) filter.id = { $in: ids };
    if (ids && ids.length === 0) return NextResponse.json({ ok: true, updated: 0 });

    const result = await db.collection('notifications').updateMany(
      filter,
      { $set: { read: true, readAt: new Date() } },
    );
    return NextResponse.json({ ok: true, updated: result.modifiedCount || 0 });
  } catch (error) {
    if (error instanceof ActivityApiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('[notifications/read] failed', error?.message);
    return NextResponse.json({ error: 'Notifications could not be updated.' }, { status: 500 });
  }
}
