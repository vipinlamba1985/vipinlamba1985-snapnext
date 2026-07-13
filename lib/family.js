import { v4 as uuidv4 } from 'uuid';

export const FAMILY_MAX_MEMBERS = 6;

export async function getFamilyForUser(db, userId) {
  if (!db || !userId) return null;
  return db.collection('families').findOne({
    status: 'active',
    $or: [{ ownerId: userId }, { members: { $elemMatch: { userId, status: 'active' } } }],
  });
}

export async function ensureFamilyForOwner(db, user) {
  let family = await db.collection('families').findOne({ ownerId: user.id, status: 'active' });
  if (family) return family;

  const now = new Date();
  family = {
    id: uuidv4(),
    ownerId: user.id,
    ownerEmail: String(user.email || '').toLowerCase(),
    name: `${user.name || 'My'} Family`,
    status: 'active',
    maxMembers: FAMILY_MAX_MEMBERS,
    members: [{ userId: user.id, email: String(user.email || '').toLowerCase(), name: user.name || 'Family owner', role: 'owner', relationship: 'owner', status: 'active', joinedAt: now }],
    invites: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.collection('families').insertOne(family);
  await db.collection('users').updateOne({ id: user.id }, { $set: { familyId: family.id, familyOwnerId: user.id, familyRole: 'owner', updatedAt: now } });
  return family;
}

export async function resolveFamilyWalletIdentity(db, user) {
  const family = await getFamilyForUser(db, user?.id);
  if (!family) return { family: null, walletOwnerId: user.id, plan: null };
  return { family, walletOwnerId: family.ownerId, plan: 'family' };
}

export function publicFamily(family, viewerId) {
  if (!family) return null;
  const isOwner = family.ownerId === viewerId;
  return {
    id: family.id,
    name: family.name,
    ownerId: family.ownerId,
    isOwner,
    maxMembers: family.maxMembers || FAMILY_MAX_MEMBERS,
    members: (family.members || []).filter((m) => m.status === 'active').map((m) => ({ userId: m.userId, name: m.name, email: m.email, role: m.role, relationship: m.relationship, joinedAt: m.joinedAt })),
    invites: isOwner ? (family.invites || []).filter((i) => i.status === 'pending').map((i) => ({ id: i.id, email: i.email, role: i.role, relationship: i.relationship, expiresAt: i.expiresAt, createdAt: i.createdAt })) : [],
  };
}
