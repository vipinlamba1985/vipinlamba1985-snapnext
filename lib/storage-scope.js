import { getPlan } from '@/lib/plans';

async function activeFamilyMembership(db, userId) {
  if (!db || !userId) return null;
  return db.collection('family_members').findOne({ userId, status: 'active' });
}

export async function resolveStorageScope({ db, user, plan }) {
  const effectivePlan = plan || getPlan(user?.plan || 'free');
  if (!db || !user?.id || effectivePlan?.id !== 'family') {
    return { type: 'user', scopeId: user?.id || null, userIds: user?.id ? [user.id] : [], storageBytes: effectivePlan?.storageBytes || 0, householdId: null };
  }

  const membership = await activeFamilyMembership(db, user.id);
  if (!membership?.householdId) {
    return { type: 'user', scopeId: user.id, userIds: [user.id], storageBytes: effectivePlan.storageBytes, householdId: null };
  }

  const members = await db.collection('family_members').find({ householdId: membership.householdId, status: 'active' }).project({ userId: 1, email: 1, role: 1 }).toArray();
  const userIds = [...new Set(members.map((member) => member.userId).filter(Boolean))];
  return { type: 'family', scopeId: membership.householdId, userIds: userIds.length ? userIds : [user.id], storageBytes: effectivePlan.storageBytes, householdId: membership.householdId, membershipRole: membership.role, members };
}

export async function getStorageScopeUsage({ db, scope }) {
  const userIds = scope?.userIds || [];
  if (!db || !userIds.length) return { bytes: 0, count: 0, byMember: [] };

  const rows = await db.collection('media').aggregate([
    { $match: { userId: { $in: userIds }, trashed: { $ne: true } } },
    { $group: { _id: '$userId', bytes: { $sum: '$size' }, count: { $sum: 1 } } },
  ]).toArray();

  const usageByUser = new Map(rows.map((row) => [row._id, row]));
  const byMember = userIds.map((userId) => {
    const row = usageByUser.get(userId);
    const member = scope?.members?.find((item) => item.userId === userId);
    return { userId, email: member?.email || null, role: member?.role || null, bytes: Number(row?.bytes || 0), count: Number(row?.count || 0) };
  });

  return { bytes: byMember.reduce((sum, item) => sum + item.bytes, 0), count: byMember.reduce((sum, item) => sum + item.count, 0), byMember };
}
