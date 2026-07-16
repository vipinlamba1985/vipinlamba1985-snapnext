import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { buildDirectorFeed, EVENT_TYPES } from '@/lib/life-event-director';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function cleanArray(value, maxItems = 20) {
  return Array.isArray(value) ? value.map(item => clean(item, 80)).filter(Boolean).slice(0, maxItems) : [];
}

async function context(request) {
  const user = await getUserFromRequest(request);
  if (!user) return { error: json({ error: 'Please sign in again.' }, 401) };
  const db = await getDb();
  return { user, db };
}

export async function GET(request) {
  const ctx = await context(request);
  if (ctx.error) return ctx.error;
  const [profiles, events, drafts] = await Promise.all([
    ctx.db.collection('life_profiles').find({ userId: ctx.user.id, archivedAt: null }).project({ _id: 0 }).sort({ updatedAt: -1 }).toArray(),
    ctx.db.collection('life_events').find({ userId: ctx.user.id, archivedAt: null }).project({ _id: 0 }).sort({ date: 1 }).toArray(),
    ctx.db.collection('life_event_drafts').find({ userId: ctx.user.id, status: { $in: ['planned', 'ready'] } }).project({ _id: 0 }).sort({ updatedAt: -1 }).limit(20).toArray(),
  ]);
  return json({ profiles, events, drafts, ...buildDirectorFeed({ profiles, events }) });
}

export async function POST(request) {
  const ctx = await context(request);
  if (ctx.error) return ctx.error;
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 40);
  const now = new Date();

  if (action === 'save-profile') {
    const id = clean(body.id, 120) || uuidv4();
    const name = clean(body.name, 120);
    const relationship = clean(body.relationship, 80);
    if (!name || !relationship) return json({ error: 'Name and relationship are required.' }, 400);
    const profile = {
      id,
      userId: ctx.user.id,
      name,
      relationship,
      birthday: body.birthday ? new Date(body.birthday) : null,
      anniversary: body.anniversary ? new Date(body.anniversary) : null,
      photoId: clean(body.photoId, 120) || null,
      currentCountry: clean(body.currentCountry, 80) || null,
      originCountries: cleanArray(body.originCountries, 10),
      celebrations: cleanArray(body.celebrations, 40),
      languages: cleanArray(body.languages, 10),
      notes: clean(body.notes, 500) || null,
      favourite: Boolean(body.favourite),
      archivedAt: null,
      updatedAt: now,
    };
    await ctx.db.collection('life_profiles').updateOne(
      { userId: ctx.user.id, id },
      { $set: profile, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    return json({ profile: { ...profile, _id: undefined } }, 201);
  }

  if (action === 'save-event') {
    const id = clean(body.id, 120) || uuidv4();
    const type = clean(body.type, 40);
    const title = clean(body.title, 160);
    if (!EVENT_TYPES.includes(type) || !title || !body.date) return json({ error: 'A valid event type, title, and date are required.' }, 400);
    const event = {
      id,
      userId: ctx.user.id,
      type,
      title,
      date: new Date(body.date),
      annual: body.annual !== false,
      personId: clean(body.personId, 120) || null,
      cultureTags: cleanArray(body.cultureTags, 20),
      countries: cleanArray(body.countries, 10),
      notes: clean(body.notes, 500) || null,
      archivedAt: null,
      updatedAt: now,
    };
    await ctx.db.collection('life_events').updateOne(
      { userId: ctx.user.id, id },
      { $set: event, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    return json({ event: { ...event, _id: undefined } }, 201);
  }

  if (action === 'prepare-package') {
    const eventId = clean(body.eventId, 120);
    const event = await ctx.db.collection('life_events').findOne({ userId: ctx.user.id, id: eventId, archivedAt: null });
    if (!event) return json({ error: 'Event not found.' }, 404);
    const formats = cleanArray(body.formats, 10);
    const draft = {
      id: uuidv4(),
      userId: ctx.user.id,
      eventId,
      title: event.title,
      formats: formats.length ? formats : ['reel', 'collage', 'whatsapp-status', 'image-post'],
      tone: clean(body.tone, 60) || 'warm',
      status: 'planned',
      autoPost: false,
      approvalRequired: true,
      createdAt: now,
      updatedAt: now,
    };
    await ctx.db.collection('life_event_drafts').insertOne(draft);
    return json({ draft: { ...draft, _id: undefined } }, 201);
  }

  return json({ error: 'Unsupported action.' }, 400);
}
