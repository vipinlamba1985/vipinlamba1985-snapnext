export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { effectivePlan, entitlementForUser } from '@/lib/entitlements';
import { resolveStorageScope, getStorageScopeUsage } from '@/lib/storage-scope';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const plan = effectivePlan(user, request);
  const scope = await resolveStorageScope({ db, user, plan });
  const usage = await getStorageScopeUsage({ db, scope });
  const devEntitlement = entitlementForUser(user, request);

  return Response.json({
    usage: { bytes: usage.bytes, count: usage.count },
    plan: { id: plan.id, name: plan.name, storageBytes: plan.storageBytes, aiPerDay: plan.aiPerDay },
    rawPlan: user.plan || 'free',
    role: user.role || 'user',
    effectivePlan: plan.id,
    isSuper: plan.id === 'super_user',
    developerProfile: devEntitlement.developerProfile || null,
    storageScope: {
      type: scope.type,
      householdId: scope.householdId,
      shared: scope.type === 'family',
      byMember: scope.type === 'family' ? usage.byMember : undefined,
    },
  });
}
