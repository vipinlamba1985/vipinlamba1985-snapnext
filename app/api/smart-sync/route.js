import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { DEFAULT_SMART_SYNC_PROFILE, normalizeSmartSyncProfile, SMART_SYNC_PROVIDERS } from '@/lib/smart-sync';
import { listProviderStatus } from '@/lib/smart-sync/providers';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }

async function storageSnapshot(db, user) {
  const [usage] = await db.collection('media').aggregate([
    { $match: { userId: user.id, trashed: { $ne: true } } },
    { $group: { _id: null, bytes: { $sum: '$size' }, items: { $sum: 1 } } },
  ]).toArray();
  return { usedBytes: usage?.bytes || 0, itemCount: usage?.items || 0 };
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const db = await getDb();
  const saved = await db.collection('smart_sync_profiles').findOne({ userId: user.id });
  const connections = await db.collection('cloud_connections').find({ userId: user.id }).project({ provider: 1, connectedAt: 1, autoSyncEnabled: 1 }).toArray();
  const readiness = new Map(listProviderStatus().map(provider => [provider.id, provider]));

  return json({
    profile: normalizeSmartSyncProfile(saved || DEFAULT_SMART_SYNC_PROFILE),
    providers: SMART_SYNC_PROVIDERS.map(provider => ({
      ...provider,
      ...(readiness.get(provider.id) || {}),
      available: true,
      connected: provider.surface === 'native'
        ? Boolean(saved?.nativeDevices?.some(device => device.provider === provider.id && device.authorized))
        : connections.some(connection => connection.provider === provider.id),
    })),
    storage: await storageSnapshot(db, user),
    updatedAt: saved?.updatedAt || null,
  });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const body = await request.json().catch(() => ({}));
  const profile = normalizeSmartSyncProfile(body.profile || body);
  const db = await getDb();
  const provider = SMART_SYNC_PROVIDERS.find(item => item.id === profile.providerId);

  if (profile.enabled && provider?.surface === 'web') {
    const connection = await db.collection('cloud_connections').findOne({ userId: user.id, provider: profile.providerId });
    if (!connection) return json({ error: `Connect ${provider.name} before enabling Smart Sync.` }, 400);
  }

  if (profile.enabled && provider?.surface === 'native') {
    const saved = await db.collection('smart_sync_profiles').findOne({ userId: user.id });
    const authorized = saved?.nativeDevices?.some(device => device.provider === profile.providerId && device.authorized);
    if (!authorized) return json({ error: `Authorize ${provider.name} in the SnapNext mobile app first.` }, 400);
  }

  const approvedAt = body.approved === false ? null : new Date();
  await db.collection('smart_sync_profiles').updateOne(
    { userId: user.id },
    { $set: { ...profile, approvedAt, userId: user.id, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );

  if (provider?.surface === 'web') {
    await db.collection('cloud_connections').updateOne(
      { userId: user.id, provider: profile.providerId },
      { $set: { autoSyncEnabled: profile.enabled, smartSyncRules: profile.rules, smartSyncPriority: profile.rules.map(rule => rule.type), updatedAt: new Date() } },
    );
  }

  return json({ ok: true, profile: { ...profile, approvedAt } });
}
