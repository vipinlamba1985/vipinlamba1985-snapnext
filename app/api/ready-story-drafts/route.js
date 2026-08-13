import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import {
  buildReadyStoryCandidates,
  READY_STORY_GENERATOR,
  READY_STORY_LIMIT,
  READY_STORY_MEDIA_LIMIT,
} from '@/lib/ready-story-drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'creative_projects';
const PROJECT_KIND = 'ready-story';

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function publicDraft(row) {
  if (!row) return null;
  const { _id, userId, fingerprint, ...safe } = row;
  return safe;
}

function fingerprint(candidate) {
  return JSON.stringify({
    type: candidate.type,
    title: candidate.title,
    kicker: candidate.kicker,
    caption: candidate.caption,
    mediaIds: candidate.mediaIds,
    happenedAt: candidate.happenedAt,
    source: candidate.source,
  });
}

async function context(request) {
  const user = await getUserFromRequest(request);
  if (!user) return { error: json({ error: 'Unauthorized' }, 401) };
  const db = await getDb();
  return { user, db };
}

async function loadInputs(db, userId) {
  return Promise.all([
    db.collection('media').find({ userId, trashed: { $ne: true }, kind: 'photo' }).project({
      _id: 0,
      id: 1,
      name: 1,
      kind: 1,
      trashed: 1,
      capturedAt: 1,
      takenAt: 1,
      mediaCreatedAt: 1,
      createdAt: 1,
      uploadedAt: 1,
      people: 1,
      people_tags: 1,
      userTags: 1,
      peopleIntelligence: 1,
      aiAnalysis: 1,
    }).sort({ createdAt: -1 }).limit(READY_STORY_MEDIA_LIMIT).toArray(),
    db.collection('memory_events').find({ userId, deleted: { $ne: true } }).project({ _id: 0 }).sort({ updatedAt: -1 }).limit(100).toArray(),
    db.collection('life_events').find({ userId, archivedAt: null }).project({ _id: 0 }).sort({ updatedAt: -1 }).limit(100).toArray(),
    db.collection('life_profiles').find({ userId, archivedAt: null }).project({ _id: 0 }).sort({ updatedAt: -1 }).limit(100).toArray(),
    db.collection('memory_stories').find({ userId, deleted: { $ne: true } }).project({ _id: 0 }).sort({ updatedAt: -1 }).limit(50).toArray(),
  ]);
}

async function refreshDrafts(db, userId) {
  const [media, memoryEvents, lifeEvents, profiles, stories] = await loadInputs(db, userId);
  const candidates = buildReadyStoryCandidates({ media, memoryEvents, lifeEvents, profiles, stories, limit: READY_STORY_LIMIT });
  const collection = db.collection(COLLECTION);
  const dismissed = candidates.length
    ? await collection.find({ userId, kind: PROJECT_KIND, id: { $in: candidates.map(item => item.id) }, status: 'dismissed' }).project({ _id: 0, id: 1 }).toArray()
    : [];
  const dismissedIds = new Set(dismissed.map(item => item.id));
  const visible = candidates.filter(item => !dismissedIds.has(item.id));
  const existing = visible.length
    ? await collection.find({ userId, kind: PROJECT_KIND, id: { $in: visible.map(item => item.id) } }).toArray()
    : [];
  const existingById = new Map(existing.map(item => [item.id, item]));
  const now = new Date();

  for (const item of visible) {
    const nextFingerprint = fingerprint(item);
    const current = existingById.get(item.id);
    if (current?.fingerprint === nextFingerprint && current?.status === 'ready') continue;
    await collection.updateOne(
      { userId, kind: PROJECT_KIND, id: item.id },
      {
        $set: {
          ...item,
          kind: PROJECT_KIND,
          userId,
          fingerprint: nextFingerprint,
          status: 'ready',
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  const activeIds = visible.map(item => item.id);
  await collection.updateMany(
    {
      userId,
      kind: PROJECT_KIND,
      generator: READY_STORY_GENERATOR,
      status: 'ready',
      ...(activeIds.length ? { id: { $nin: activeIds } } : {}),
    },
    { $set: { status: 'stale', updatedAt: now } },
  );

  return collection
    .find({ userId, kind: PROJECT_KIND, status: 'ready' })
    .sort({ score: -1, happenedAt: -1, updatedAt: -1 })
    .limit(READY_STORY_LIMIT)
    .toArray();
}

export async function GET(request) {
  try {
    const ctx = await context(request);
    if (ctx.error) return ctx.error;
    const collection = ctx.db.collection(COLLECTION);
    const id = clean(new URL(request.url).searchParams.get('id'), 160);
    if (id) {
      const story = await collection.findOne({ userId: ctx.user.id, kind: PROJECT_KIND, id, status: 'ready' });
      if (!story) return json({ error: 'Ready story not found.' }, 404);
      return json({ story: publicDraft(story) });
    }
    const items = await collection
      .find({ userId: ctx.user.id, kind: PROJECT_KIND, status: 'ready' })
      .sort({ score: -1, happenedAt: -1, updatedAt: -1 })
      .limit(READY_STORY_LIMIT)
      .toArray();
    return json({ items: items.map(publicDraft) });
  } catch (error) {
    console.error('[ready-story-drafts] load failed', error?.message);
    return json({ error: 'Ready stories are temporarily unavailable.' }, 500);
  }
}

export async function POST(request) {
  try {
    const ctx = await context(request);
    if (ctx.error) return ctx.error;
    const body = await request.json().catch(() => ({}));
    const action = clean(body.action || 'refresh', 40).toLowerCase();

    if (action === 'refresh') {
      const items = await refreshDrafts(ctx.db, ctx.user.id);
      return json({
        items: items.map(publicDraft),
        generation: 'deterministic',
        aiCreditsUsed: 0,
        autoPost: false,
        approvalRequired: true,
      });
    }

    const id = clean(body.id, 160);
    if (!id) return json({ error: 'Story ID is required.' }, 400);
    const collection = ctx.db.collection(COLLECTION);

    if (action === 'dismiss') {
      const result = await collection.updateOne(
        { userId: ctx.user.id, kind: PROJECT_KIND, id },
        { $set: { status: 'dismissed', dismissedAt: new Date(), updatedAt: new Date() } },
      );
      if (!result.matchedCount) return json({ error: 'Ready story not found.' }, 404);
      return json({ ok: true, dismissed: id });
    }

    if (action === 'mark-reviewed') {
      const result = await collection.updateOne(
        { userId: ctx.user.id, kind: PROJECT_KIND, id, status: 'ready' },
        { $set: { reviewedAt: new Date(), updatedAt: new Date() } },
      );
      if (!result.matchedCount) return json({ error: 'Ready story not found.' }, 404);
      return json({ ok: true, reviewed: id });
    }

    return json({ error: 'Unsupported action.' }, 400);
  } catch (error) {
    console.error('[ready-story-drafts] update failed', error?.message);
    return json({ error: 'Ready stories could not be updated.' }, 500);
  }
}
