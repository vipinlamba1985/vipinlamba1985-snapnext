import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { ageBandFor, minorAccountsEnabled, sanitizeMinorPermissions, writeFamilyAudit } from '@/lib/family-safety';

export const runtime = 'nodejs';
function json(data, status = 200) { return NextResponse.json(data, { status }); }
function text(value, max = 160) { return String(value || '').trim().slice(0, max); }
async function ctx(request, routeContext) { const user = await getUserFromRequest(request); if (!user) return { error: json({ error: 'Please sign in again.' }, 401) }; const db = await getDb(); const action = (await routeContext.params).action || []; return { user, db, action }; }
async function ownedProfile(db, guardianUserId, profileId) { return db.collection('family_minor_profiles').findOne({ id: profileId, guardianUserId, status: { $ne: 'deleted' } }); }

export async function GET(request, routeContext) {
  const c = await ctx(request, routeContext); if (c.error) return c.error;
  const { user, db, action } = c; const [resource, id] = action;
  if (resource === 'status') {
    const profiles = await db.collection('family_minor_profiles').find({ guardianUserId: user.id, status: { $ne: 'deleted' } }).sort({ createdAt: -1 }).toArray();
    const ids = profiles.map(profile => profile.id);
    const consents = ids.length ? await db.collection('family_consent_records').find({ minorProfileId: { $in: ids }, status: 'active' }).sort({ consentedAt: -1 }).toArray() : [];
    const pendingChats = await db.collection('chat_threads').find({ guardianUserId: user.id, status: 'pending_guardian' }).sort({ createdAt: -1 }).limit(100).toArray();
    return json({ featureEnabled: minorAccountsEnabled(), legalReviewRequired: true, profiles: profiles.map(({ _id, ...profile }) => ({ ...profile, consent: consents.find(item => item.minorProfileId === profile.id) || null })), pendingChats: pendingChats.map(({ _id, ...thread }) => thread) });
  }
  if (resource === 'audit' && id) {
    const profile = await ownedProfile(db, user.id, id); if (!profile) return json({ error: 'Family profile not found.' }, 404);
    const events = await db.collection('family_safety_audit').find({ minorProfileId: id }).sort({ createdAt: -1 }).limit(200).toArray();
    return json({ events: events.map(({ _id, ...event }) => event) });
  }
  return json({ error: 'Not found.' }, 404);
}

export async function POST(request, routeContext) {
  const c = await ctx(request, routeContext); if (c.error) return c.error;
  const { user, db, action } = c; const [resource, id, subresource] = action; const body = await request.json().catch(() => ({}));
  if (resource === 'profiles' && !id) {
    const displayName = text(body.displayName, 80); const birthDate = text(body.birthDate, 20); const band = ageBandFor(birthDate);
    if (!displayName || !band) return json({ error: 'Enter a valid child name and birth date for a person under 18.' }, 400);
    const now = new Date(); const profile = { id: uuidv4(), guardianUserId: user.id, userId: null, displayName, birthDate: new Date(birthDate), ageBand: band.id, controlMode: band.control, status: 'draft', permissions: sanitizeMinorPermissions(body.permissions), trustedContactIds: [], approvedCommunityIds: [], legalReviewRequired: true, createdAt: now, updatedAt: now };
    await db.collection('family_minor_profiles').insertOne(profile); await writeFamilyAudit(db, { minorProfileId: profile.id, actorUserId: user.id, action: 'minor_profile_created', details: { ageBand: band.id } });
    return json({ profile: { ...profile, _id: undefined } }, 201);
  }
  const profile = id ? await ownedProfile(db, user.id, id) : null; if (id && !profile) return json({ error: 'Family profile not found.' }, 404);

  if (resource === 'profiles' && id && subresource === 'link-account') {
    const email = text(body.email, 320).toLowerCase(); const target = await db.collection('users').findOne({ email });
    if (!target) return json({ error: 'No SnapNext account was found with that email.' }, 404);
    const existing = await db.collection('family_minor_profiles').findOne({ userId: target.id, id: { $ne: id }, status: { $ne: 'deleted' } }); if (existing) return json({ error: 'That account is already linked to another family profile.' }, 409);
    await db.collection('family_minor_profiles').updateOne({ id }, { $set: { userId: target.id, linkedAt: new Date(), updatedAt: new Date() } });
    await writeFamilyAudit(db, { minorProfileId: id, actorUserId: user.id, action: 'minor_account_linked', subjectUserId: target.id }); return json({ ok: true, userId: target.id });
  }
  if (resource === 'profiles' && id && subresource === 'consent') {
    const consentVersion = text(body.consentVersion, 80); const method = text(body.method, 80); const relationship = text(body.relationship, 80);
    if (!consentVersion || !method || !relationship) return json({ error: 'Consent version, verification method, and guardian relationship are required.' }, 400);
    await db.collection('family_consent_records').updateMany({ minorProfileId: id, status: 'active' }, { $set: { status: 'withdrawn', withdrawnAt: new Date(), withdrawnBy: user.id } });
    const record = { id: uuidv4(), minorProfileId: id, guardianUserId: user.id, consentVersion, method, relationship, status: 'active', consentedAt: new Date() };
    await db.collection('family_consent_records').insertOne(record); await db.collection('family_minor_profiles').updateOne({ id }, { $set: { status: minorAccountsEnabled() ? 'active' : 'legal_hold', updatedAt: new Date() } });
    await writeFamilyAudit(db, { minorProfileId: id, actorUserId: user.id, action: 'guardian_consent_recorded', details: { consentVersion, method, relationship } }); return json({ ok: true, consent: record, featureEnabled: minorAccountsEnabled() });
  }
  if (resource === 'profiles' && id && subresource === 'permissions') {
    const permissions = sanitizeMinorPermissions(body.permissions); await db.collection('family_minor_profiles').updateOne({ id }, { $set: { permissions, updatedAt: new Date() } }); await writeFamilyAudit(db, { minorProfileId: id, actorUserId: user.id, action: 'minor_permissions_updated', details: permissions }); return json({ ok: true, permissions });
  }
  if (resource === 'profiles' && id && subresource === 'trusted-contact') {
    const email = text(body.email, 320).toLowerCase(); const target = await db.collection('users').findOne({ email }); if (!target) return json({ error: 'No SnapNext account was found with that email.' }, 404);
    await db.collection('family_minor_profiles').updateOne({ id }, { $addToSet: { trustedContactIds: target.id }, $set: { updatedAt: new Date() } }); await writeFamilyAudit(db, { minorProfileId: id, actorUserId: user.id, action: 'trusted_contact_approved', subjectUserId: target.id }); return json({ ok: true, contact: { id: target.id, name: target.name || target.displayName || target.email?.split('@')[0], email: target.email } });
  }
  if (resource === 'profiles' && id && subresource === 'approve-community') {
    const threadId = text(body.threadId, 120); const thread = await db.collection('chat_threads').findOne({ id: threadId, type: 'community' }); if (!thread) return json({ error: 'Community not found.' }, 404);
    await db.collection('family_minor_profiles').updateOne({ id }, { $addToSet: { approvedCommunityIds: threadId }, $set: { updatedAt: new Date() } }); await writeFamilyAudit(db, { minorProfileId: id, actorUserId: user.id, action: 'community_approved', details: { threadId } }); return json({ ok: true });
  }
  if (resource === 'profiles' && id && subresource === 'approve-chat') {
    const threadId = text(body.threadId, 120); const thread = await db.collection('chat_threads').findOne({ id: threadId, guardianUserId: user.id, status: 'pending_guardian' }); if (!thread) return json({ error: 'Pending chat request not found.' }, 404);
    await db.collection('chat_threads').updateOne({ id: threadId }, { $set: { status: 'pending', guardianApprovedAt: new Date(), guardianApprovedBy: user.id, lastMessage: 'Guardian approved · waiting for recipient', updatedAt: new Date() } }); await writeFamilyAudit(db, { minorProfileId: id, actorUserId: user.id, action: 'minor_chat_approved', details: { threadId } }); return json({ ok: true });
  }
  if (resource === 'profiles' && id && subresource === 'withdraw-consent') {
    await db.collection('family_consent_records').updateMany({ minorProfileId: id, status: 'active' }, { $set: { status: 'withdrawn', withdrawnAt: new Date(), withdrawnBy: user.id } }); await db.collection('family_minor_profiles').updateOne({ id }, { $set: { status: 'suspended', updatedAt: new Date() } }); await writeFamilyAudit(db, { minorProfileId: id, actorUserId: user.id, action: 'guardian_consent_withdrawn' }); return json({ ok: true });
  }
  return json({ error: 'Not found.' }, 404);
}
