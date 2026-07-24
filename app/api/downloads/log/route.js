import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { ActivityApiError, parseDownloadLogRequest } from '@/lib/notifications-downloads-contract';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const { mediaIds } = parseDownloadLogRequest(body);
    const db = await getDb();
    const owned = await db.collection('media')
      .find({ id: { $in: mediaIds }, userId: user.id, trashed: { $ne: true } })
      .project({ _id: 0, id: 1 })
      .toArray();
    const ownedIds = owned.map((item) => item.id);
    if (!ownedIds.length) {
      return NextResponse.json({ error: 'No owned media in download selection.', code: 'downloads_media_forbidden' }, { status: 403 });
    }

    const doc = {
      id: uuidv4(),
      userId: user.id,
      mediaIds: ownedIds,
      requestedCount: mediaIds.length,
      loggedCount: ownedIds.length,
      createdAt: new Date(),
    };
    await db.collection('downloads').insertOne(doc);
    return NextResponse.json({ ok: true, logged: ownedIds.length, skipped: mediaIds.length - ownedIds.length });
  } catch (error) {
    if (error instanceof ActivityApiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('[downloads/log] failed', error?.message);
    return NextResponse.json({ error: 'Download activity could not be recorded.' }, { status: 500 });
  }
}
