import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { entitlementForUser } from '@/lib/entitlements';
import { normalizeSmartSyncProfile, SMART_SYNC_PROVIDERS, smartSyncSummary } from '@/lib/smart-sync';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const profile = normalizeSmartSyncProfile(body.profile || body);
  const provider = SMART_SYNC_PROVIDERS.find(item => item.id === profile.providerId);
  const estimate = body.estimate || {};
  const db = await getDb();
  const [usage] = await db.collection('media').aggregate([
    { $match: { userId: user.id, trashed: { $ne: true } } },
    { $group: { _id: null, bytes: { $sum: '$size' }, items: { $sum: 1 } } },
  ]).toArray();
  const entitlement = entitlementForUser(user);
  const usedBytes = usage?.bytes || 0;
  const limitBytes = entitlement.realIsSuper ? 0 : entitlement.plan.storageBytes || 0;
  const remainingBytes = limitBytes ? Math.max(0, limitBytes - usedBytes) : 0;
  const estimatedBytes = Math.max(0, Number(estimate.bytes || 0));
  const estimatedItems = Math.max(0, Number(estimate.items || 0));

  return NextResponse.json({
    preflight: {
      source: provider?.name || profile.providerId,
      providerId: profile.providerId,
      rules: smartSyncSummary(profile),
      priority: profile.rules.filter(rule => rule.enabled).sort((a, b) => a.priority - b.priority).map(rule => rule.type),
      estimatedItems,
      estimatedBytes,
      usedBytes,
      limitBytes,
      remainingBytes,
      fitsAvailableStorage: !limitBytes || !estimatedBytes || estimatedBytes <= remainingBytes,
      actionWhenFull: profile.stopAtCapacity ? 'stop_at_capacity' : 'require_user_action',
      duplicates: 'skip',
      originals: 'untouched',
      automaticFutureSync: profile.enabled,
      batchSize: 10,
      requiresApproval: true,
    },
  });
}
