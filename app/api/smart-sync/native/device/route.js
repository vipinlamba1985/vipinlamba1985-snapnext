import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const body = await request.json().catch(() => ({}));
  const provider = body.provider;
  if (!['ios_photos', 'android_media'].includes(provider)) return json({ error: 'Unsupported native source.' }, 400);

  const deviceId = String(body.deviceId || '').trim().slice(0, 128);
  if (!deviceId) return json({ error: 'Device information is required.' }, 400);

  const device = {
    provider,
    deviceId,
    name: String(body.name || 'Mobile device').slice(0, 120),
    platform: provider === 'ios_photos' ? 'ios' : 'android',
    authorized: Boolean(body.authorized),
    permission: ['limited', 'full', 'none'].includes(body.permission) ? body.permission : 'none',
    backgroundUploadAvailable: Boolean(body.backgroundUploadAvailable),
    appVersion: String(body.appVersion || '').slice(0, 40),
    lastSeenAt: new Date(),
  };

  const db = await getDb();
  await db.collection('smart_sync_profiles').updateOne(
    { userId: user.id },
    {
      $pull: { nativeDevices: { provider, deviceId } },
      $setOnInsert: { userId: user.id, createdAt: new Date() },
      $set: { updatedAt: new Date() },
    },
    { upsert: true },
  );
  await db.collection('smart_sync_profiles').updateOne(
    { userId: user.id },
    { $push: { nativeDevices: device }, $set: { updatedAt: new Date() } },
  );

  return json({ ok: true, device });
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const { provider, deviceId } = await request.json().catch(() => ({}));
  const db = await getDb();
  await db.collection('smart_sync_profiles').updateOne(
    { userId: user.id },
    { $pull: { nativeDevices: { provider: String(provider || ''), deviceId: String(deviceId || '') } }, $set: { updatedAt: new Date() } },
  );
  return json({ ok: true });
}
