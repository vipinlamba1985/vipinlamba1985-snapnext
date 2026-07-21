import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { entitlementForUser } from '@/lib/entitlements';
import { validateNativeManifest, buildNativeUploadPlan } from '@/lib/smart-sync/native-bridge';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  try {
    const body = await request.json();
    const manifest = validateNativeManifest(body.manifest);
    const mode = body.mode === 'automatic' ? 'automatic' : 'manual';
    if (!manifest.deviceId) return json({ error: 'Device information is required.' }, 400);

    const db = await getDb();
    const profile = await db.collection('smart_sync_profiles').findOne({ userId: user.id });
    if (!profile?.approvedAt || !profile.enabled) return json({ error: 'Review, approve, and enable Smart Sync first.' }, 400);
    if (profile.providerId !== manifest.provider) return json({ error: 'The active Smart Sync source does not match this device.' }, 409);

    const device = profile.nativeDevices?.find(item => item.provider === manifest.provider && item.deviceId === manifest.deviceId);
    if (!device?.authorized || !['limited', 'full'].includes(device.permission)) {
      return json({ error: 'Photo access is required on this device.', code: 'photo_permission_required' }, 403);
    }
    if (mode === 'automatic' && (device.permission !== 'full' || !device.backgroundUploadAvailable)) {
      return json({
        error: 'Full photo-library permission and background upload access are required for automatic backup.',
        code: 'full_photo_permission_required',
        manualUploadAvailable: true,
      }, 403);
    }

    const [usage] = await db.collection('media').aggregate([
      { $match: { userId: user.id, trashed: { $ne: true } } },
      { $group: { _id: null, bytes: { $sum: '$size' } } },
    ]).toArray();
    const checksums = manifest.assets.map(asset => asset.checksum).filter(Boolean);
    const duplicateRows = checksums.length
      ? await db.collection('media').find({ userId: user.id, hash: { $in: checksums }, trashed: { $ne: true } }).project({ hash: 1 }).toArray()
      : [];

    const entitlement = entitlementForUser(user);
    const usedBytes = Number(usage?.bytes || 0);
    const limitBytes = entitlement.realIsSuper ? 0 : Number(entitlement.plan.storageBytes || 0);
    const unlimited = !limitBytes;
    const remainingBytes = unlimited ? 0 : Math.max(0, limitBytes - usedBytes);
    const plan = buildNativeUploadPlan({
      profile,
      manifest,
      remainingBytes,
      unlimited,
      duplicateChecksums: duplicateRows.map(row => row.hash),
    });

    return json({
      plan: {
        ...plan,
        source: manifest.provider,
        deviceId: manifest.deviceId,
        mode,
        requiresConfirmation: mode !== 'automatic',
        batchSize: 10,
      },
      permission: { level: device.permission, backgroundUploadAvailable: device.backgroundUploadAvailable },
      storage: { usedBytes, limitBytes, remainingBytes, unlimited },
    });
  } catch (error) {
    return json({ error: error.message || 'Smart Sync could not prepare this upload.' }, 400);
  }
}
