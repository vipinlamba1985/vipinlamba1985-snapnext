import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_MEMBERS = 6;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ROLES = new Set(['adult', 'child']);

function cleanEmail(value) { return String(value || '').trim().toLowerCase(); }
function tokenHash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
async function currentMembership(db, userId) { return db.collection('family_members').findOne({ userId, status: 'active' }); }
async function ownerForHousehold(db, householdId) {
  const household = await db.collection('family_households').findOne({ id: householdId });
  if (!household) return { household: null, owner: null };
  const owner = await db.collection('users').findOne({ id: household.ownerUserId });
  return { household, owner };
}
async function inAppNotify(db, userId, title, message, type = 'family') {
  if (!userId) return;
  await db.collection('notifications').insertOne({ id: uuidv4(), userId, type, title, message, read: false, createdAt: new Date() }).catch(() => null);
}

async function ensureOwnerHousehold(db, user) {
  let membership = await currentMembership(db, user.id);
  if (membership) return membership;
  if (user.plan !== 'family' && user.role !== 'admin') return null;
  const now = new Date();
  const householdId = uuidv4();
  await db.collection('family_households').insertOne({ id: householdId, ownerUserId: user.id, name: `${user.name || 'My'} Family`, maxMembers: MAX_MEMBERS, createdAt: now, updatedAt: now });
  membership = { id: uuidv4(), householdId, userId: user.id, email: cleanEmail(user.email), role: 'owner', status: 'active', joinedAt: now, createdAt: now };
  await db.collection('family_members').insertOne(membership);
  return membership;
}

async function householdSnapshot(db, membership) {
  if (!membership) return null;
  const household = await db.collection('family_households').findOne({ id: membership.householdId });
  if (!household) return null;
  const now = new Date();
  await db.collection('family_invites').updateMany({ householdId: household.id, status: 'pending', expiresAt: { $lte: now } }, { $set: { status: 'expired', expiredAt: now } }).catch(() => null);
  const members = await db.collection('family_members').find({ householdId: household.id, status: 'active' }).sort({ createdAt: 1 }).toArray();
  const invites = membership.role === 'owner' ? await db.collection('family_invites').find({ householdId: household.id, status: 'pending' }).sort({ createdAt: -1 }).toArray() : [];
  return {
    household: { id: household.id, name: household.name, ownerUserId: household.ownerUserId, maxMembers: household.maxMembers || MAX_MEMBERS },
    membership: { role: membership.role, userId: membership.userId },
    members: members.map(({ _id, ...m }) => m),
    invites: invites.map(({ _id, tokenHash: ignored, ...i }) => i),
    privacy: { personalLibrariesPrivateByDefault: true, automaticSharing: false },
  };
}

async function createAndSendInvite({ db, request, user, membership, email, role, replacesInviteId = null }) {
  const { household } = await ownerForHousehold(db, membership.householdId);
  const rawToken = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const invite = { id: uuidv4(), householdId: membership.householdId, invitedByUserId: user.id, email, role, status: 'pending', tokenHash: tokenHash(rawToken), createdAt: now, expiresAt: new Date(now.getTime() + INVITE_TTL_MS), replacesInviteId };
  await db.collection('family_invites').insertOne(invite);
  const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const joinUrl = `${origin}/family/join?token=${rawToken}`;
  const delivery = await sendEmail({ template: 'family_invite', to: email, userId: user.id, data: { ownerName: user.name || user.email, householdName: household?.name || `${user.name || 'My'} Family`, role, joinUrl, expiresAt: invite.expiresAt.toLocaleDateString('en-CA') }, meta: { householdId: membership.householdId, inviteId: invite.id } });
  await db.collection('family_invites').updateOne({ id: invite.id }, { $set: { deliveryStatus: delivery?.ok ? 'sent' : 'failed', deliveryProvider: delivery?.provider || null, deliveryUpdatedAt: new Date() } });
  return { ...invite, joinUrl, deliveryStatus: delivery?.ok ? 'sent' : 'failed' };
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
    if (await db.collection('family_members').findOne({ householdId: membership.householdId, email, status: 'active' })) return Response.json({ error: 'This person is already a family member.' }, { status: 409 });
    await db.collection('family_invites').updateMany({ householdId: membership.householdId, email, status: 'pending' }, { $set: { status: 'replaced', updatedAt: new Date() } });
    const invite = await createAndSendInvite({ db, request, user, membership, email, role });
    return Response.json({ ok: true, invite: { id: invite.id, email, role, expiresAt: invite.expiresAt, deliveryStatus: invite.deliveryStatus, joinUrl: invite.joinUrl } });
  }

  if (action === 'resend') {
    const membership = await currentMembership(db, user.id);
    if (!membership || membership.role !== 'owner') return Response.json({ error: 'Only the Family Owner can resend invitations.' }, { status: 403 });
    const previous = await db.collection('family_invites').findOne({ id: body.inviteId, householdId: membership.householdId, status: 'pending' });
    if (!previous) return Response.json({ error: 'Pending invitation not found.' }, { status: 404 });
    await db.collection('family_invites').updateOne({ id: previous.id }, { $set: { status: 'replaced', replacedAt: new Date() } });
    const invite = await createAndSendInvite({ db, request, user, membership, email: previous.email, role: previous.role, replacesInviteId: previous.id });
    return Response.json({ ok: true, invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt, deliveryStatus: invite.deliveryStatus } });
  }

  if (action === 'accept') {
    const rawToken = String(body.token || '');
    if (!rawToken) return Response.json({ error: 'Invitation link is missing.' }, { status: 400 });
    const hashed = tokenHash(rawToken);
    const anyInvite = await db.collection('family_invites').findOne({ tokenHash: hashed });
    if (!anyInvite) return Response.json({ error: 'This invitation link is invalid.' }, { status: 404 });
    if (anyInvite.status !== 'pending' || new Date(anyInvite.expiresAt) <= new Date()) return Response.json({ error: 'This invitation has expired or was replaced. Ask the Family Owner to resend it.' }, { status: 410 });
    const invite = anyInvite;
    if (cleanEmail(user.email) !== invite.email) return Response.json({ error: `This invitation is for ${invite.email}. Sign in with that email to continue.` }, { status: 403 });
    const existing = await currentMembership(db, user.id);
    if (existing && existing.householdId !== invite.householdId) return Response.json({ error: 'Leave your current Family before joining another.' }, { status: 409 });
    if (await db.collection('family_members').countDocuments({ householdId: invite.householdId, status: 'active' }) >= MAX_MEMBERS) return Response.json({ error: 'This Family is full.' }, { status: 409 });
    const now = new Date();
    await db.collection('family_members').updateOne({ householdId: invite.householdId, userId: user.id }, { $set: { email: cleanEmail(user.email), role: invite.role, status: 'active', joinedAt: now, updatedAt: now }, $setOnInsert: { id: uuidv4(), createdAt: now } }, { upsert: true });
    await db.collection('family_invites').updateOne({ id: invite.id, status: 'pending' }, { $set: { status: 'accepted', acceptedByUserId: user.id, acceptedAt: now } });
    const { household, owner } = await ownerForHousehold(db, invite.householdId);
    await inAppNotify(db, owner?.id, 'Family member joined', `${user.name || user.email} joined ${household?.name || 'your Family'}.`);
    if (owner?.email) await sendEmail({ template: 'family_joined', to: owner.email, userId: owner.id, data: { memberName: user.name, memberEmail: user.email, familyUrl: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin}/family` }, meta: { householdId: invite.householdId, memberUserId: user.id } });
    return Response.json({ ok: true, family: await householdSnapshot(db, await currentMembership(db, user.id)) });
  }

  if (action === 'leave') {
    const membership = await currentMembership(db, user.id);
    if (!membership) return Response.json({ ok: true });
    if (membership.role === 'owner') return Response.json({ error: 'The Family Owner cannot leave while the household exists.' }, { status: 409 });
    await db.collection('family_members').updateOne({ id: membership.id }, { $set: { status: 'left', leftAt: new Date() } });
    const { household, owner } = await ownerForHousehold(db, membership.householdId);
    await inAppNotify(db, owner?.id, 'Family member left', `${user.name || user.email} left ${household?.name || 'your Family'}.`);
    if (owner?.email) await sendEmail({ template: 'family_membership_ended', to: owner.email, userId: owner.id, data: { memberName: user.name || user.email, action: 'left', familyUrl: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin}/family` }, meta: { householdId: membership.householdId, memberUserId: user.id } });
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
    const result = await db.collection('family_invites').updateOne({ id: inviteId, householdId: membership.householdId, status: 'pending' }, { $set: { status: 'cancelled', cancelledAt: new Date() } });
    if (!result.matchedCount) return Response.json({ error: 'Pending invitation not found.' }, { status: 404 });
    return Response.json({ ok: true });
  }
  const member = await db.collection('family_members').findOne({ id: memberId, householdId: membership.householdId, status: 'active' });
  if (!member || member.role === 'owner') return Response.json({ error: 'Member not found.' }, { status: 404 });
  await db.collection('family_members').updateOne({ id: member.id }, { $set: { status: 'removed', removedAt: new Date(), removedByUserId: user.id } });
  const removedUser = await db.collection('users').findOne({ id: member.userId });
  await inAppNotify(db, member.userId, 'Family membership ended', `You were removed from the Family plan. Your personal files remain safe.`);
  if (removedUser?.email) await sendEmail({ template: 'family_membership_ended', to: removedUser.email, userId: removedUser.id, data: { memberName: removedUser.name || removedUser.email, action: 'removed', familyUrl: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin}/family` }, meta: { householdId: membership.householdId, memberUserId: member.userId } });
  return Response.json({ ok: true });
}