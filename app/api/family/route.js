import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_MEMBERS = 6;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ROLES = new Set(['adult', 'child']);

function cleanEmail(value) { return String(value || '').trim().toLowerCase(); }
function tokenHash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

async function currentMembership(db, userId) {
  return db.collection('family_members').findOne({ userId, status: 'active' });
}

async function ensureOwnerHousehold(db, user) {
  let membership = await currentMembership(db, user.id);
  if (membership) return membership;
  if (user.plan !== 'family' && user.role !== 'admin') return null;
  const now = new Date();
  const householdId = uuidv4();
  await db.collection('family_households').insertOne({
    id: householdId,
    ownerUserId: user.id,
    name: `${user.name || 'My'} Family`,
    maxMembers: MAX_MEMBERS,
    createdAt: now,
    updatedAt: now,
  });
  membership = { id: uuidv4(), householdId, userId: user.id, email: cleanEmail(user.email), role: 'owner', status: 'active', joinedAt: now, createdAt: now };
  await db.collection('family_members').insertOne(membership);
  return membership;
}

async function householdSnapshot(db, membership) {
  if (!membership) return null;
  const household = await db.collection('family_households').findOne({ id: membership.householdId });
  if (!household) return null;
  const members = await db.collection('family_members').find({ householdId: household.id, status: 'active' }).sort({ createdAt: 1 }).toArray();
  const invites = membership.role === 'owner'
    ? await db.collection('family_invites').find({ householdId: household.id, status: 'pending', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).toArray()
    : [];
  return {
    household: { id: household.id, name: household.name, ownerUserId: household.ownerUserId, maxMembers: household.maxMembers || MAX_MEMBERS },
    membership: { role: membership.role, userId: membership.userId },
    members: members.map(({ _id, ...m }) => m),
    invites: invites.map(({ _id, tokenHash: ignored, ...i }) => i),
    privacy: { personalLibrariesPrivateByDefault: true, automaticSharing: false },
  };
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const membership = await ensureOwnerHousehold(db, user);
  return Response.json({ family: await householdSnapshot(db, membership), eligible: user.plan === 'family' || user.role === 'admin' || !!membership });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === 'invite') {
    const membership = await ensureOwnerHousehold(db, user);
    if (!membership || membership.role !== 'owner') return Response.json({ error: 'Only the Family Owner can invite members.' }, { status: 403 });
    const email = cleanEmail(body.email);
    const role = ROLES.has(body.role) ? body.role : 'adult';
    if (!email) return Response.json({ error: 'Email is required.' }, { status: 400 });
    if (email === cleanEmail(user.email)) return Response.json({ error: 'You are already the Family Owner.' }, { status: 400 });
    const activeCount = await db.collection('family_members').countDocuments({ householdId: membership.householdId, status: 'active' });
    const pendingCount = await db.collection('family_invites').countDocuments({ householdId: membership.householdId, status: 'pending', expiresAt: { $gt: new Date() } });
    if (activeCount + pendingCount >= MAX_MEMBERS) return Response.json({ error: `Family supports up to ${MAX_MEMBERS} members including the owner.` }, { status: 409 });
    const existingMember = await db.collection('family_members').findOne({ householdId: membership.householdId, email, status: 'active' });
    if (existingMember) return Response.json({ error: 'This person is already a family member.' }, { status: 409 });
    await db.collection('family_invites').updateMany({ householdId: membership.householdId, email, status: 'pending' }, { $set: { status: 'replaced', updatedAt: new Date() } });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const invite = { id: uuidv4(), householdId: membership.householdId, invitedByUserId: user.id, email, role, status: 'pending', tokenHash: tokenHash(rawToken), createdAt: now, expiresAt: new Date(now.getTime() + INVITE_TTL_MS) };
    await db.collection('family_invites').insertOne(invite);
    const origin = new URL(request.url).origin;
    return Response.json({ ok: true, invite: { id: invite.id, email, role, expiresAt: invite.expiresAt, joinUrl: `${origin}/family/join?token=${rawToken}` } });
  }

  if (action === 'accept') {
    const rawToken = String(body.token || '');
    if (!rawToken) return Response.json({ error: 'Invitation token is required.' }, { status: 400 });
    const invite = await db.collection('family_invites').findOne({ tokenHash: tokenHash(rawToken), status: 'pending', expiresAt: { $gt: new Date() } });
    if (!invite) return Response.json({ error: 'Invitation is invalid or expired.' }, { status: 410 });
    if (cleanEmail(user.email) !== invite.email) return Response.json({ error: `Sign in with ${invite.email} to accept this invitation.` }, { status: 403 });
    const existing = await currentMembership(db, user.id);
    if (existing && existing.householdId !== invite.householdId) return Response.json({ error: 'Leave your current Family before joining another.' }, { status: 409 });
    const activeCount = await db.collection('family_members').countDocuments({ householdId: invite.householdId, status: 'active' });
    if (activeCount >= MAX_MEMBERS) return Response.json({ error: 'This Family is full.' }, { status: 409 });
    const now = new Date();
    await db.collection('family_members').updateOne(
      { householdId: invite.householdId, userId: user.id },
      { $set: { email: cleanEmail(user.email), role: invite.role, status: 'active', joinedAt: now, updatedAt: now }, $setOnInsert: { id: uuidv4(), createdAt: now } },
      { upsert: true },
    );
    await db.collection('family_invites').updateOne({ id: invite.id, status: 'pending' }, { $set: { status: 'accepted', acceptedByUserId: user.id, acceptedAt: now } });
    return Response.json({ ok: true, family: await householdSnapshot(db, await currentMembership(db, user.id)) });
  }

  if (action === 'leave') {
    const membership = await currentMembership(db, user.id);
    if (!membership) return Response.json({ ok: true });
    if (membership.role === 'owner') return Response.json({ error: 'The Family Owner cannot leave while the household exists. Remove members or cancel the Family plan first.' }, { status: 409 });
    await db.collection('family_members').updateOne({ id: membership.id }, { $set: { status: 'left', leftAt: new Date() } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unsupported action.' }, { status: 400 });
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const membership = await currentMembership(db, user.id);
  if (!membership || membership.role !== 'owner') return Response.json({ error: 'Only the Family Owner can remove members.' }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get('memberId');
  const inviteId = searchParams.get('inviteId');
  if (inviteId) {
    await db.collection('family_invites').updateOne({ id: inviteId, householdId: membership.householdId, status: 'pending' }, { $set: { status: 'cancelled', cancelledAt: new Date() } });
    return Response.json({ ok: true });
  }
  const member = await db.collection('family_members').findOne({ id: memberId, householdId: membership.householdId, status: 'active' });
  if (!member || member.role === 'owner') return Response.json({ error: 'Member not found.' }, { status: 404 });
  await db.collection('family_members').updateOne({ id: member.id }, { $set: { status: 'removed', removedAt: new Date(), removedByUserId: user.id } });
  return Response.json({ ok: true });
}
