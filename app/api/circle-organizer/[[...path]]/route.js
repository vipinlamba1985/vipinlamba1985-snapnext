import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { buildDefaultPreferences, buildDigest, buildSignalDocument, ATTENTION_MODES, ORGANIZER_BUCKETS } from '@/lib/circle-organizer';
import { cleanMongo } from '@/lib/circles';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }
export async function GET(request, context) { return handle(request, context); }
export async function POST(request, context) { return handle(request, context); }
export async function PATCH(request, context) { return handle(request, context); }
export async function DELETE(request, context) { return handle(request, context); }

async function ensureIndexes(db) {
  await Promise.allSettled([
    db.collection('circle_signals').createIndex({ userId: 1, bucket: 1, createdAt: -1 }),
    db.collection('circle_signals').createIndex({ userId: 1, circleId: 1, createdAt: -1 }),
    db.collection('circle_signals').createIndex({ userId: 1, originalUrl: 1 }, { unique: true, sparse: true }),
    db.collection('circle_attention_preferences').createIndex({ userId: 1 }, { unique: true }),
  ]);
}

async function getPreferences(db, userId) {
  let prefs = await db.collection('circle_attention_preferences').findOne({ userId });
  if (!prefs) {
    prefs = buildDefaultPreferences(userId);
    await db.collection('circle_attention_preferences').insertOne(prefs);
  }
  return prefs;
}

async function handle(request, context) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const db = await getDb();
    await ensureIndexes(db);
    const params = await context.params;
    const route = '/' + (params?.path || []).join('/');
    const method = request.method;

    if (route === '/' && method === 'GET') {
      const url = new URL(request.url);
      const bucket = url.searchParams.get('bucket');
      const circleId = url.searchParams.get('circleId');
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 60)));
      const query = { userId: user.id, isHidden: { $ne: true } };
      if (bucket && ORGANIZER_BUCKETS.includes(bucket)) query.bucket = bucket;
      if (circleId) query.circleId = circleId;
      const [signals, preferences, circles] = await Promise.all([
        db.collection('circle_signals').find(query).sort({ priority: -1, dueAt: 1, createdAt: -1 }).limit(limit).toArray(),
        getPreferences(db, user.id),
        db.collection('circles').find({ userId: user.id, isArchived: { $ne: true } }).sort({ priority: -1, updatedAt: -1 }).toArray(),
      ]);
      const digest = buildDigest(signals.map(cleanMongo));
      return json({ ...digest, preferences: cleanMongo(preferences), circles: circles.map(cleanMongo), modes: ATTENTION_MODES });
    }

    if (route === '/signals' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body.circleId) {
        const circle = await db.collection('circles').findOne({ id: body.circleId, userId: user.id, isArchived: { $ne: true } });
        if (!circle) return json({ error: 'Circle not found' }, 404);
      }
      const preferences = await getPreferences(db, user.id);
      const signal = buildSignalDocument(user.id, body, preferences);
      if (signal.originalUrl) {
        const existing = await db.collection('circle_signals').findOne({ userId: user.id, originalUrl: signal.originalUrl, isHidden: { $ne: true } });
        if (existing) return json({ signal: cleanMongo(existing), existing: true });
      }
      await db.collection('circle_signals').insertOne(signal);
      return json({ signal: cleanMongo(signal) }, 201);
    }

    if (route === '/preferences' && method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const allowed = ['mode', 'digestEnabled', 'digestHour', 'quietHours', 'badgeMode'];
      const changes = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
      if (changes.mode && !ATTENTION_MODES[changes.mode]) return json({ error: 'Invalid attention mode' }, 400);
      changes.updatedAt = new Date();
      await db.collection('circle_attention_preferences').updateOne({ userId: user.id }, { $set: changes, $setOnInsert: buildDefaultPreferences(user.id) }, { upsert: true });
      return json({ preferences: cleanMongo(await db.collection('circle_attention_preferences').findOne({ userId: user.id })) });
    }

    const signalMatch = route.match(/^\/signals\/([^/]+)$/);
    if (signalMatch) {
      const id = signalMatch[1];
      const signal = await db.collection('circle_signals').findOne({ id, userId: user.id });
      if (!signal) return json({ error: 'Signal not found' }, 404);
      if (method === 'PATCH') {
        const body = await request.json().catch(() => ({}));
        const allowed = ['bucket', 'isRead', 'isSaved', 'isHidden', 'priority', 'dueAt'];
        const changes = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
        if (changes.bucket && !ORGANIZER_BUCKETS.includes(changes.bucket)) return json({ error: 'Invalid bucket' }, 400);
        if (changes.priority !== undefined) changes.priority = Math.max(0, Math.min(100, Number(changes.priority)));
        if (changes.dueAt) changes.dueAt = new Date(changes.dueAt);
        changes.updatedAt = new Date();
        await db.collection('circle_signals').updateOne({ id, userId: user.id }, { $set: changes });
        return json({ signal: cleanMongo(await db.collection('circle_signals').findOne({ id, userId: user.id })) });
      }
      if (method === 'DELETE') {
        await db.collection('circle_signals').updateOne({ id, userId: user.id }, { $set: { isHidden: true, updatedAt: new Date() } });
        return json({ ok: true });
      }
    }

    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[circle-organizer]', error);
    const message = error?.message || 'Circle organizer request failed';
    return json({ error: message }, /required|valid|invalid/i.test(message) ? 400 : 500);
  }
}
