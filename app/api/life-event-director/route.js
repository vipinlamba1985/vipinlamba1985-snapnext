import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { buildDirectorFeed, EVENT_TYPES } from '@/lib/life-event-director';
import {
  buildCelebrationSetupPrompts,
  buildContextualCelebrations,
  buildMemoryCelebrationSuggestions,
  resolveProfileCelebrationDate,
} from '@/lib/celebration-intelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
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

async function resolveEvent(db, userId, eventId) {
  const saved = await db.collection('life_events').findOne({ userId, id: eventId, archivedAt: null });
  if (saved) return saved;
  const [kind, profileId] = String(eventId || '').split(':');
  if (!['birthday', 'anniversary'].includes(kind) || !profileId) return null;
  const profile = await db.collection('life_profiles').findOne({ userId, id: profileId, archivedAt: null });
  const date = kind === 'birthday' ? profile?.birthday : profile?.anniversary;
  if (!profile || !date) return null;
  return {
    id: eventId,
    userId,
    type: kind,
    title: `${profile.name}'s ${kind}`,
    date,
    annual: true,
    personId: profile.id,
    cultureTags: profile.celebrations || [],
    countries: [...(profile.originCountries || []), profile.currentCountry].filter(Boolean),
  };
}

async function loadIntelligenceInputs(db, user) {
  const userId = user.id;
  const [profiles, events, media, people, feedback, favoriteCount] = await Promise.all([
    db.collection('life_profiles').find({ userId, archivedAt: null }).project({ _id: 0 }).sort({ updatedAt: -1 }).toArray(),
    db.collection('life_events').find({ userId, archivedAt: null }).project({ _id: 0 }).sort({ date: 1 }).toArray(),
    db.collection('media').find({ userId, trashed: { $ne: true } }).project({
      _id: 0,
      id: 1,
      name: 1,
      userCategory: 1,
      userTags: 1,
      people_tags: 1,
      people: 1,
      peopleIntelligence: 1,
      aiAnalysis: 1,
      capturedAt: 1,
      takenAt: 1,
      createdAt: 1,
      exif: 1,
      country: 1,
      countryCode: 1,
      location: 1,
    }).sort({ createdAt: -1 }).limit(750).toArray(),
    db.collection('person_clusters').find({ userId, status: { $nin: ['hidden', 'rejected', 'legacy'] } }).project({ _id: 0, clusterId: 1, displayName: 1, isSelf: 1 }).limit(500).toArray(),
    db.collection('life_event_suggestion_feedback').find({ userId, status: { $in: ['dismissed', 'confirmed'] } }).project({ _id: 0, suggestionId: 1 }).limit(500).toArray(),
    db.collection('favorites').countDocuments({
      status: 'accepted',
      $or: [{ requesterUserId: userId }, { targetUserId: userId }],
    }),
  ]);
  const selfProfile = profiles.find((profile) => ['you', 'self', 'me'].includes(String(profile.relationship || '').trim().toLowerCase())) || null;
  const selfName = clean(selfProfile?.name || user.name || user.displayName, 80) || null;
  const peopleByCluster = Object.fromEntries(people
    .map((person) => [String(person.clusterId), {
      name: person.isSelf ? selfName : clean(person.displayName, 80) || null,
      isSelf: Boolean(person.isSelf),
    }])
    .filter(([clusterId, identity]) => clusterId && (identity.isSelf || identity.name)));
  return {
    profiles,
    events,
    media,
    peopleByCluster,
    feedbackIds: feedback.map((row) => row.suggestionId).filter(Boolean),
    favoriteCount,
  };
}

async function buildPersonalIntelligence(db, user) {
  const inputs = await loadIntelligenceInputs(db, user);
  return {
    ...inputs,
    memorySuggestions: buildMemoryCelebrationSuggestions(inputs),
    setupPrompts: buildCelebrationSetupPrompts({ user, profiles: inputs.profiles, favoriteCount: inputs.favoriteCount }),
  };
}

async function buildIntelligence(db, user) {
  const personal = await buildPersonalIntelligence(db, user);
  const contextualCelebrations = await buildContextualCelebrations({ profiles: personal.profiles, media: personal.media });
  return { ...personal, contextualCelebrations };
}

export async function GET(request) {
  const ctx = await context(request);
  if (ctx.error) return ctx.error;
  const [intelligence, drafts] = await Promise.all([
    buildIntelligence(ctx.db, ctx.user),
    ctx.db.collection('life_event_drafts').find({ userId: ctx.user.id, status: { $in: ['planned', 'ready'] } }).project({ _id: 0 }).sort({ updatedAt: -1 }).limit(20).toArray(),
  ]);
  return json({
    profiles: intelligence.profiles,
    events: intelligence.events,
    drafts,
    ...buildDirectorFeed({ profiles: intelligence.profiles, events: intelligence.events }),
    memorySuggestions: intelligence.memorySuggestions,
    setupPrompts: intelligence.setupPrompts,
    contextualCelebrations: intelligence.contextualCelebrations,
  });
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
    const birthday = body.birthday ? new Date(body.birthday) : null;
    const anniversary = body.anniversary ? new Date(body.anniversary) : null;
    if ((birthday && Number.isNaN(birthday.getTime())) || (anniversary && Number.isNaN(anniversary.getTime()))) return json({ error: 'Use a valid birthday or anniversary date.' }, 400);
    const profile = {
      id,
      userId: ctx.user.id,
      name,
      relationship,
      birthday,
      anniversary,
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
    const date = body.date ? new Date(body.date) : null;
    if (!EVENT_TYPES.includes(type) || !title || !date || Number.isNaN(date.getTime())) return json({ error: 'A valid event type, title, and date are required.' }, 400);
    const event = {
      id,
      userId: ctx.user.id,
      type,
      title,
      date,
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

  if (action === 'confirm-suggestion' || action === 'dismiss-suggestion') {
    const suggestionId = clean(body.suggestionId, 80);
    if (!suggestionId) return json({ error: 'Suggestion is required.' }, 400);
    const intelligence = await buildPersonalIntelligence(ctx.db, ctx.user);
    const suggestion = intelligence.memorySuggestions.find((item) => item.id === suggestionId);
    if (!suggestion) return json({ error: 'That suggestion is no longer available.' }, 404);

    if (action === 'dismiss-suggestion') {
      await ctx.db.collection('life_event_suggestion_feedback').updateOne(
        { userId: ctx.user.id, suggestionId },
        { $set: { userId: ctx.user.id, suggestionId, status: 'dismissed', updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
      return json({ ok: true, dismissed: suggestionId });
    }

    const suggestedDate = new Date(suggestion.date);
    if (Number.isNaN(suggestedDate.getTime())) return json({ error: 'That suggestion has an invalid date.' }, 400);
    const confirmedDate = body.confirmedDate ? new Date(body.confirmedDate) : null;
    if (confirmedDate && Number.isNaN(confirmedDate.getTime())) return json({ error: 'Use a valid confirmed date.' }, 400);
    const matchingProfile = suggestion.personIsSelf
      ? intelligence.profiles.find((profile) => ['you', 'self', 'me'].includes(String(profile.relationship || '').trim().toLowerCase()))
      : suggestion.personName
        ? intelligence.profiles.find((profile) => String(profile.name || '').trim().toLowerCase() === suggestion.personName.toLowerCase())
        : null;
    let date = confirmedDate || suggestedDate;
    let savedEvent = null;
    if (matchingProfile && ['birthday', 'anniversary'].includes(suggestion.type)) {
      date = resolveProfileCelebrationDate({
        monthDay: suggestion.monthDay,
        existingDate: matchingProfile[suggestion.type],
        confirmedDate,
      });
      if (!date) {
        return json({ error: `Add the actual ${suggestion.type} including the year before confirming this memory suggestion.` }, 400);
      }
      await ctx.db.collection('life_profiles').updateOne(
        { userId: ctx.user.id, id: matchingProfile.id },
        { $set: { [suggestion.type]: date, updatedAt: now } },
      );
    } else {
      const event = {
        id: uuidv4(),
        userId: ctx.user.id,
        type: suggestion.type,
        title: suggestion.personName
          ? `${suggestion.personName}'s ${suggestion.type}`
          : suggestion.type === 'birthday' ? 'Birthday celebration' : 'Anniversary',
        date,
        annual: true,
        personId: null,
        cultureTags: [],
        countries: [],
        notes: `Confirmed from SnapNext memory suggestion (${suggestion.confidence} confidence).`,
        source: 'confirmed-memory-suggestion',
        sourceMediaIds: suggestion.sourceMediaIds || [],
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.db.collection('life_events').insertOne(event);
      savedEvent = event;
    }
    await ctx.db.collection('life_event_suggestion_feedback').updateOne(
      { userId: ctx.user.id, suggestionId },
      { $set: { userId: ctx.user.id, suggestionId, status: 'confirmed', suggestionType: suggestion.type, personName: suggestion.personName || null, date, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    return json({ ok: true, confirmed: suggestionId, profileId: matchingProfile?.id || null, event: savedEvent ? { ...savedEvent, _id: undefined } : null });
  }

  if (action === 'prepare-package') {
    const eventId = clean(body.eventId, 120);
    const event = await resolveEvent(ctx.db, ctx.user.id, eventId);
    if (!event) return json({ error: 'Event not found.' }, 404);
    const formats = cleanArray(body.formats, 10);
    const draft = {
      id: uuidv4(),
      userId: ctx.user.id,
      eventId,
      personId: event.personId || null,
      eventType: event.type,
      title: event.title,
      formats: formats.length ? formats : ['reel', 'collage', 'whatsapp-status', 'image-post'],
      tone: clean(body.tone, 60) || 'warm',
      cultureTags: event.cultureTags || [],
      countries: event.countries || [],
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
