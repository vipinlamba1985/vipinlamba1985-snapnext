export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { FAMILY_MAX_MEMBERS, ensureFamilyForOwner, getFamilyForUser, publicFamily } from '@/lib/family';

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function canOwnFamily(user) {
  return user?.plan === 'family' || user?.plan === 'super_user' || user?.role === 'admin';
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const family = await getFamilyForUser(db, user.id);
  return Response.json({ family: publicFamily(family, user.id), eligible: canOwnFamily(user), maxMembers: FAMILY_MAX_MEMBERS, privacy: 'private_by_default' });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canOwnFamily(user)) return Response.json({ error: 'Family plan required.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const email = normalizedEmail(body.email);
  const role = body.role === 'child' ? 'child' : 'adult';
  const relationship = String(body.relationship || 'family').slice(0, 40);
  if (!email || !email.includes('@')) return Response.json({ error: 'Valid email required.' }, { status: 400 });
  if (email === normalizedEmail(user.email)) return Response.json({ error: 'You are already the Family Owner.' }, { status: 400 });

  const db = await getDb();
  const family = await ensureFamilyForOwner(db, user);
  const activeMembers = (family.members || []).filter((m) => m.status === 'active');
  const pendingInvites = (family.invites || []).filter((i) => i.status === 'pending' && new Date(i.expiresAt) > new Date());
  if (activeMembers.length + pendingInvites.length >= (family.maxMembers || FAMILY_MAX_MEMBERS)) return Response.json({ error: 'Family member limit reached.' }, { status: 409 });
  if (activeMembers.some((m) => normalizedEmail(m.email) === email) || pendingInvites.some((i) => normalizedEmail(i.email) === email)) return Response.json({ error: 'This person is already a member or has a pending invitation.' }, { status: 409 });

  const now = new Date();
  const invite = { id: uuidv4(), token: crypto.randomBytes(32).toString('hex'), email, role, relationship, status: 'pending', createdBy: user.id, createdAt: now, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) };
  await db.collection('families').updateOne({ id: family.id, ownerId: user.id }, { $push: { invites: invite }, $set: { updatedAt: now } });
  const inviteUrl = `${request.nextUrl.origin}/family/join?token=${invite.token}`;
  return Response.json({ invite: { id: invite.id, email, role, relationship, expiresAt: invite.expiresAt }, inviteUrl });
}

export async function PATCH(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const db = await getDb();

  if (body.action === 'accept') {
    const token = String(body.token || '');
    const family = await db.collection('families').findOne({ status: 'active', invites: { $elemMatch: { token, status: 'pending', expiresAt: { $gt: new Date() } } } });
    if (!family) return Response.json({ error: 'Invitation is invalid or expired.' }, { status: 404 });
    const invite = (family.invites || []).find((i) => i.token === token && i.status === 'pending');
    if (!invite || normalizedEmail(invite.email) !== normalizedEmail(user.email)) return Response.json({ error: 'Sign in with the invited email address.' }, { status: 403 });
    if ((family.members || []).filter((m) => m.status === 'active').length >= (family.maxMembers || FAMILY_MAX_MEMBERS)) return Response.json({ error: 'Family member limit reached.' }, { status: 409 });
    const existingFamily = await getFamilyForUser(db, user.id);
    if (existingFamily && existingFamily.id !== family.id) return Response.json({ error: 'Leave your current family before joining another.' }, { status: 409 });

    const now = new Date();
    const member = { userId: user.id, email: normalizedEmail(user.email), name: user.name || user.email, role: invite.role || 'adult', relationship: invite.relationship || 'family', status: 'active', joinedAt: now };
    await db.collection('families').updateOne({ id: family.id, 'invites.token': token }, { $set: { 'invites.$.status': 'accepted', 'invites.$.acceptedAt': now, updatedAt: now }, $addToSet: { members: member } });
    await db.collection('users').updateOne({ id: user.id }, { $set: { familyId: family.id, familyOwnerId: family.ownerId, familyRole: member.role, updatedAt: now } });
    return Response.json({ family: publicFamily(await db.collection('families').findOne({ id: family.id }), user.id) });
  }

  const family = await getFamilyForUser(db, user.id);
  if (!family || family.ownerId !== user.id) return Response.json({ error: 'Family Owner access required.' }, { status: 403 });

  if (body.action === 'remove_member') {
    const memberUserId = String(body.memberUserId || '');
    if (!memberUserId || memberUserId === family.ownerId) return Response.json({ error: 'The Family Owner cannot be removed.' }, { status: 400 });
    const now = new Date();
    await db.collection('families').updateOne({ id: family.id, ownerId: user.id }, { $pull: { members: { userId: memberUserId } }, $set: { updatedAt: now } });
    await db.collection('users').updateOne({ id: memberUserId, familyId: family.id }, { $unset: { familyId: '', familyOwnerId: '', familyRole: '' }, $set: { updatedAt: now } });
    return Response.json({ ok: true });
  }

  if (body.action === 'cancel_invite') {
    const inviteId = String(body.inviteId || '');
    await db.collection('families').updateOne({ id: family.id, ownerId: user.id, 'invites.id': inviteId }, { $set: { 'invites.$.status': 'cancelled', 'invites.$.cancelledAt': new Date(), updatedAt: new Date() } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unsupported action.' }, { status: 400 });
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const family = await getFamilyForUser(db, user.id);
  if (!family) return Response.json({ ok: true });
  if (family.ownerId === user.id) return Response.json({ error: 'The Family Owner must remove members or cancel the Family plan; ownership cannot be abandoned.' }, { status: 409 });
  const now = new Date();
  await db.collection('families').updateOne({ id: family.id }, { $pull: { members: { userId: user.id } }, $set: { updatedAt: now } });
  await db.collection('users').updateOne({ id: user.id }, { $unset: { familyId: '', familyOwnerId: '', familyRole: '' }, $set: { updatedAt: now } });
  return Response.json({ ok: true });
}
