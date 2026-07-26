import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_CIRCLES = [
  { name: 'Family', icon: '❤️', priority: 100 },
  { name: 'Friends', icon: '👥', priority: 90 },
  { name: 'Education', icon: '🎓', priority: 70 },
  { name: 'Sports', icon: '🏀', priority: 60 },
  { name: 'Professional', icon: '💼', priority: 50 },
  { name: 'Entertainment', icon: '🎬', priority: 40 },
];

const CATEGORY_RULES = [
  ['Sports', ['nba','nfl','nhl','mlb','fifa','football','soccer','basketball','hockey','cricket','sports','espn','raptors','formula1','f1']],
  ['Education', ['edu','learn','science','history','nasa','natgeo','school','university','course','tutorial','knowledge','geography','math','physics']],
  ['Professional', ['business','founder','ceo','company','official','career','marketing','finance','invest','startup','linkedin','tech','developer']],
  ['Entertainment', ['fun','meme','movie','music','gaming','game','comedy','celebrity','entertainment','netflix','creator']],
];

function json(data, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

function clean(value, max = 160) { return String(value || '').trim().slice(0, max); }
function normalizeHandle(value) {
  const raw = clean(value, 240);
  if (!raw) return '';
  if (raw.startsWith('@')) return `@${raw.slice(1).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80)}`;
  try {
    const url = new URL(raw);
    const part = url.pathname.split('/').filter(Boolean).pop() || '';
    return part ? `@${part.replace(/^@/, '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80)}` : '';
  } catch {
    return `@${raw.replace(/^@/, '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80)}`;
  }
}
function inferPlatform(value, explicit) {
  const chosen = clean(explicit, 40).toLowerCase();
  if (chosen) return chosen;
  const text = clean(value, 300).toLowerCase();
  if (text.includes('instagram.com')) return 'instagram';
  if (text.includes('tiktok.com')) return 'tiktok';
  if (text.includes('youtube.com') || text.includes('youtu.be')) return 'youtube';
  if (text.includes('facebook.com')) return 'facebook';
  if (text.includes('linkedin.com')) return 'linkedin';
  if (text.includes('x.com') || text.includes('twitter.com')) return 'x';
  return 'other';
}
function suggestCategory({ handle, displayName, notes }) {
  const text = `${handle} ${displayName} ${notes}`.toLowerCase();
  for (const [category, words] of CATEGORY_RULES) {
    if (words.some(word => text.includes(word))) return { category, confidence: 'high', reason: `Profile signals match ${category.toLowerCase()} content.` };
  }
  return { category: 'Friends', confidence: 'low', reason: 'Not enough public context to classify safely. Please confirm the Circle.' };
}
async function context(request) {
  const user = await getUserFromRequest(request);
  if (!user) return { error: json({ error: 'Please sign in again.' }, 401) };
  return { user, db: await getDb() };
}
async function ensureDefaults(db, userId) {
  const count = await db.collection('circles').countDocuments({ userId, archivedAt: null });
  if (count) return;
  const now = new Date();
  await db.collection('circles').insertMany(DEFAULT_CIRCLES.map(item => ({ id: uuidv4(), userId, ...item, source: 'starter-template', archivedAt: null, createdAt: now, updatedAt: now })));
}

export async function GET(request) {
  const ctx = await context(request); if (ctx.error) return ctx.error;
  await ensureDefaults(ctx.db, ctx.user.id);
  const [circles, profiles] = await Promise.all([
    ctx.db.collection('circles').find({ userId: ctx.user.id, archivedAt: null }).project({ _id: 0 }).sort({ priority: -1, createdAt: 1 }).toArray(),
    ctx.db.collection('circle_profiles').find({ userId: ctx.user.id, archivedAt: null }).project({ _id: 0 }).sort({ updatedAt: -1 }).toArray(),
  ]);
  const enriched = circles.map(circle => {
    const members = profiles.filter(profile => (profile.circleIds || []).includes(circle.id));
    return { ...circle, profileCount: members.length, worthSeeing: members.reduce((sum, profile) => sum + Number(profile.worthSeeing || 0), 0), profiles: members.slice(0, 6) };
  });
  return json({ circles: enriched, profiles, totalProfiles: profiles.length, worthSeeing: profiles.reduce((sum, profile) => sum + Number(profile.worthSeeing || 0), 0) });
}

export async function POST(request) {
  const ctx = await context(request); if (ctx.error) return ctx.error;
  await ensureDefaults(ctx.db, ctx.user.id);
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 40);
  const now = new Date();

  if (action === 'create-circle') {
    const name = clean(body.name, 60);
    if (!name) return json({ error: 'Circle name is required.' }, 400);
    const existing = await ctx.db.collection('circles').findOne({ userId: ctx.user.id, archivedAt: null, name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    if (existing) return json({ error: 'A Circle with this name already exists.' }, 409);
    const circle = { id: uuidv4(), userId: ctx.user.id, name, icon: clean(body.icon, 8) || '✨', priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 50, source: 'user', archivedAt: null, createdAt: now, updatedAt: now };
    await ctx.db.collection('circles').insertOne(circle);
    return json({ circle: { ...circle, _id: undefined } }, 201);
  }

  if (action === 'suggest-profile') {
    const handle = normalizeHandle(body.profile || body.handle || body.url);
    if (!handle) return json({ error: 'Enter an @profile or profile link.' }, 400);
    return json({ handle, platform: inferPlatform(body.url || body.profile, body.platform), suggestion: suggestCategory({ handle, displayName: body.displayName, notes: body.notes }) });
  }

  if (action === 'add-profile') {
    const handle = normalizeHandle(body.profile || body.handle || body.url);
    if (!handle) return json({ error: 'Enter an @profile or profile link.' }, 400);
    const platform = inferPlatform(body.url || body.profile, body.platform);
    const suggestion = suggestCategory({ handle, displayName: body.displayName, notes: body.notes });
    let circleId = clean(body.circleId, 120);
    if (!circleId) {
      const suggested = await ctx.db.collection('circles').findOne({ userId: ctx.user.id, archivedAt: null, name: suggestion.category });
      circleId = suggested?.id || '';
    }
    const circle = circleId ? await ctx.db.collection('circles').findOne({ userId: ctx.user.id, id: circleId, archivedAt: null }) : null;
    if (!circle) return json({ error: 'Choose a Circle for this profile.' }, 400);
    const key = `${platform}:${handle.toLowerCase()}`;
    const existing = await ctx.db.collection('circle_profiles').findOne({ userId: ctx.user.id, key, archivedAt: null });
    const circleIds = [...new Set([...(existing?.circleIds || []), circle.id])];
    const profile = {
      id: existing?.id || uuidv4(), userId: ctx.user.id, key, handle, platform,
      displayName: clean(body.displayName, 100) || existing?.displayName || handle,
      profileUrl: clean(body.url, 500) || existing?.profileUrl || null,
      circleIds, starred: existing?.starred || false,
      classification: { category: circle.name, confidence: body.circleId ? 'user-confirmed' : suggestion.confidence, reason: body.circleId ? 'Chosen by you.' : suggestion.reason },
      updateAccess: 'not-connected', worthSeeing: 0, archivedAt: null,
      createdAt: existing?.createdAt || now, updatedAt: now,
    };
    await ctx.db.collection('circle_profiles').updateOne({ userId: ctx.user.id, key }, { $set: profile }, { upsert: true });
    return json({ profile: { ...profile, _id: undefined }, circle: { id: circle.id, name: circle.name } }, existing ? 200 : 201);
  }

  if (action === 'move-profile') {
    const profileId = clean(body.profileId, 120); const circleId = clean(body.circleId, 120);
    const circle = await ctx.db.collection('circles').findOne({ userId: ctx.user.id, id: circleId, archivedAt: null });
    if (!circle) return json({ error: 'Circle not found.' }, 404);
    const result = await ctx.db.collection('circle_profiles').updateOne({ userId: ctx.user.id, id: profileId, archivedAt: null }, { $set: { circleIds: [circleId], 'classification.category': circle.name, 'classification.confidence': 'user-confirmed', 'classification.reason': 'Chosen by you.', updatedAt: now } });
    if (!result.matchedCount) return json({ error: 'Profile not found.' }, 404);
    return json({ ok: true });
  }

  if (action === 'set-priority') {
    const circleId = clean(body.circleId, 120); const priority = Math.max(0, Math.min(100, Number(body.priority) || 0));
    const result = await ctx.db.collection('circles').updateOne({ userId: ctx.user.id, id: circleId, archivedAt: null }, { $set: { priority, updatedAt: now } });
    if (!result.matchedCount) return json({ error: 'Circle not found.' }, 404);
    return json({ ok: true, priority });
  }

  if (action === 'toggle-star') {
    const profileId = clean(body.profileId, 120);
    const profile = await ctx.db.collection('circle_profiles').findOne({ userId: ctx.user.id, id: profileId, archivedAt: null });
    if (!profile) return json({ error: 'Profile not found.' }, 404);
    await ctx.db.collection('circle_profiles').updateOne({ userId: ctx.user.id, id: profileId }, { $set: { starred: !profile.starred, updatedAt: now } });
    return json({ ok: true, starred: !profile.starred });
  }

  return json({ error: 'Unsupported action.' }, 400);
}
