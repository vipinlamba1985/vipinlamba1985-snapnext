import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const db = await getDb();
  const connection = await db.collection('cloud_connections').findOne({ userId: user.id, provider: 'google_drive' });
  return json({
    connected: Boolean(connection),
    enabled: Boolean(connection?.autoSyncEnabled),
    lastSyncAt: connection?.lastAutoSyncAt || null,
    lastResult: connection?.lastAutoSyncResult || null,
  });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const body = await request.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);
  const now = new Date();
  const db = await getDb();
  const update = { autoSyncEnabled: enabled, autoSyncUpdatedAt: now, updatedAt: now };
  if (enabled) update.autoSyncCursorAt = now;
  const result = await db.collection('cloud_connections').updateOne(
    { userId: user.id, provider: 'google_drive' },
    { $set: update },
  );
  if (!result.matchedCount) return json({ error: 'Connect Google Drive first.' }, 400);
  return json({ ok: true, enabled, startsFrom: enabled ? now : null });
}
