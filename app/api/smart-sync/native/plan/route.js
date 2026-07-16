import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { entitlementForUser } from '@/lib/entitlements';
import { validateNativeManifest, buildNativeUploadPlan } from '@/lib/smart-sync/native-bridge';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  try {
    const body = await request.json();
    const manifest = validateNativeManifest(body.manifest);
    const db = await getDb();
    const profile = await db.collection('smart_sync_profiles').findOne({ userId: user.id });
    if (!profile?.approvedAt) return NextResponse.json({ error: 'Review and approve your Smart Sync plan first.' }, { status: 400 });

    const usage = await db.collection('media').aggregate([
      { $match: { userId: user.id, trashed: { $ne: true } } },
      { $group: { _id: null, bytes: { $sum: '$size' } } },
    ]).toArray();
    const entitlement = entitlementForUser(user);
    const usedBytes = usage[0]?.bytes || 0;
    const limitBytes = entitlement.realIsSuper ? 0 : entitlement.plan.storageBytes || 0;
    const remainingBytes = limitBytes ? Math.max(0, limitBytes - usedBytes) : 0;
    const plan = buildNativeUploadPlan({ profile, manifest, remainingBytes });

    return NextResponse.json({
      plan: {
        ...plan,
        source: manifest.provider,
        deviceId: manifest.deviceId,
        requiresConfirmation: true,
        batchSize: 10,
      },
      storage: { usedBytes, limitBytes, remainingBytes },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Smart Sync could not prepare this upload.' }, { status: 400 });
  }
}
