import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GRACE_MS = Number(process.env.STORAGE_ORPHAN_GRACE_MINUTES || 60) * 60 * 1000;
const MAX_USERS = 50;
const MAX_OBJECTS_PER_USER = 1000;

function authorized(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${expected}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (storage.active() !== 's3') {
    return NextResponse.json({ ok: true, skipped: true, reason: 's3_not_active' });
  }

  const db = await getDb();
  const users = await db.collection('users')
    .find({}, { projection: { id: 1 } })
    .limit(MAX_USERS)
    .toArray();

  const cutoff = Date.now() - GRACE_MS;
  let scanned = 0;
  let deleted = 0;
  let failed = 0;

  for (const user of users) {
    if (!user?.id) continue;
    const referenced = new Set(
      (await db.collection('media')
        .find({ userId: user.id, provider: 's3' }, { projection: { storageKey: 1 } })
        .limit(MAX_OBJECTS_PER_USER)
        .toArray())
        .map((item) => item.storageKey)
        .filter(Boolean),
    );

    let continuationToken;
    do {
      const page = await storage.listUserObjects({
        userId: user.id,
        continuationToken,
        maxKeys: MAX_OBJECTS_PER_USER,
      });
      continuationToken = page.nextContinuationToken || undefined;

      for (const object of page.objects) {
        scanned += 1;
        const modifiedAt = object.lastModified ? new Date(object.lastModified).getTime() : Date.now();
        if (referenced.has(object.storageKey) || modifiedAt > cutoff) continue;
        try {
          await storage.delete({ provider: 's3', storageKey: object.storageKey });
          deleted += 1;
        } catch (error) {
          failed += 1;
          console.error(JSON.stringify({
            level: 'error',
            event: 'storage_orphan_delete_failed',
            storageKey: object.storageKey,
            errorName: error?.name || 'Error',
          }));
        }
      }
    } while (continuationToken && scanned < MAX_USERS * MAX_OBJECTS_PER_USER);
  }

  return NextResponse.json({ ok: true, scanned, deleted, failed, graceMinutes: GRACE_MS / 60000 });
}
