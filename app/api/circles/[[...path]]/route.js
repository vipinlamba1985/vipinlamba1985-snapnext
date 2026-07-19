import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { buildCircleDocument, buildSourceDocument, cleanMongo, CIRCLE_PLATFORMS, CONNECTION_MODES } from '@/lib/circles';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }
async function requireUser(request) { return getUserFromRequest(request); }

async function ensureIndexes(db) {
  await Promise.allSettled([
    db.collection('circles').createIndex({ userId: 1, isArchived: 1, updatedAt: -1 }),
    db.collection('circle_sources').createIndex({ userId: 1, circleId: 1, createdAt: -1 }),
    db.collection('circle_sources').createIndex({ userId: 1, platform: 1, profileUrl: 1 }, { unique: true }),
    db.collection('circle_updates').createIndex({ userId: 1, publishedAt: -1 }),
    db.collection('circle_updates').createIndex({ platform: 1, externalUpdateId: 1 }, { unique: true, sparse: true }),
    db.collection('circle_update_state').createIndex({ userId: 1, updateId: 1 }, { unique: true }),
  ]);
}

export async function OPTIONS() { return new NextResponse(null, { status: 200 }); }
export async function GET(request, context) { return handle(request, context); }
export async function POST(request, context) { return handle(request, context); }
export async function PATCH(request, context) { return handle(request, context); }
export async function DELETE(request, context) { return handle(request, context); }

async function handle(request, context) {
  try {
    const user = await requireUser(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const db = await getDb();
    await ensureIndexes(db);
    const params = await context.params;
    const path = params?.path || [];
    const route = '/' + path.join('/');
    const method = request.method;

    if (route === '/' && method === 'GET') {
      const circles = await db.collection('circles').find({ userId: user.id, isArchived: { $ne: true } }).sort({ priority: -1, updatedAt: -1 }).toArray();
      const sourceCounts = await db.collection('circle_sources').aggregate([
        { $match: { userId: user.id } }, { $group: { _id: '$circleId', count: { $sum: 1 } } },
      ]).toArray();
      const counts = Object.fromEntries(sourceCounts.map((x) => [x._id, x.count]));
      return json({ circles: circles.map((c) => ({ ...cleanMongo(c), sourceCount: counts[c.id] || 0 })), platforms: CIRCLE_PLATFORMS, connectionModes: CONNECTION_MODES });
    }

    if (route === '/' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const circle = buildCircleDocument(user.id, body);
      await db.collection('circles').insertOne(circle);
      return json({ circle: cleanMongo(circle) }, 201);
    }

    if (route === '/feed' && method === 'GET') {
      const url = new URL(request.url);
      const circleId = url.searchParams.get('circleId');
      const filter = url.searchParams.get('filter') || 'latest';
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 25)));
      const sourceQuery = { userId: user.id, ...(circleId ? { circleId } : {}) };
      const sources = await db.collection('circle_sources').find(sourceQuery).toArray();
      const sourceIds = sources.map((source) => source.id);
      const updateQuery = { userId: user.id, sourceId: { $in: sourceIds } };
      if (filter === 'important') updateQuery.importanceScore = { $gte: 70 };
      const updates = sourceIds.length ? await db.collection('circle_updates').find(updateQuery).sort({ importanceScore: -1, publishedAt: -1 }).limit(limit).toArray() : [];
      const states = updates.length ? await db.collection('circle_update_state').find({ userId: user.id, updateId: { $in: updates.map((u) => u.id) } }).toArray() : [];
      const stateMap = Object.fromEntries(states.map((state) => [state.updateId, cleanMongo(state)]));
      const sourceMap = Object.fromEntries(sources.map((source) => [source.id, cleanMongo(source)]));
      return json({ updates: updates.map((update) => ({ ...cleanMongo(update), source: sourceMap[update.sourceId], state: stateMap[update.id] || {} })), hasLiveIntegrations: sources.some((source) => source.connectionStatus === 'active') });
    }

    const circleMatch = route.match(/^\/([^/]+)$/);
    if (circleMatch) {
      const circleId = circleMatch[1];
      const circle = await db.collection('circles').findOne({ id: circleId, userId: user.id });
      if (!circle) return json({ error: 'Circle not found' }, 404);
      if (method === 'GET') {
        const sources = await db.collection('circle_sources').find({ userId: user.id, circleId }).sort({ priority: -1, createdAt: -1 }).toArray();
        return json({ circle: cleanMongo(circle), sources: sources.map(cleanMongo) });
      }
      if (method === 'PATCH') {
        const body = await request.json().catch(() => ({}));
        const allowed = ['name', 'description', 'icon', 'circleType', 'notificationLevel', 'aiInstructions', 'priority', 'isArchived'];
        const changes = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
        changes.updatedAt = new Date();
        await db.collection('circles').updateOne({ id: circleId, userId: user.id }, { $set: changes });
        return json({ circle: cleanMongo(await db.collection('circles').findOne({ id: circleId, userId: user.id })) });
      }
      if (method === 'DELETE') {
        await db.collection('circles').updateOne({ id: circleId, userId: user.id }, { $set: { isArchived: true, updatedAt: new Date() } });
        return json({ ok: true });
      }
    }

    const sourceListMatch = route.match(/^\/([^/]+)\/sources$/);
    if (sourceListMatch) {
      const circleId = sourceListMatch[1];
      const circle = await db.collection('circles').findOne({ id: circleId, userId: user.id, isArchived: { $ne: true } });
      if (!circle) return json({ error: 'Circle not found' }, 404);
      if (method === 'GET') {
        const sources = await db.collection('circle_sources').find({ userId: user.id, circleId }).sort({ priority: -1, createdAt: -1 }).toArray();
        return json({ sources: sources.map(cleanMongo) });
      }
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const source = buildSourceDocument(user.id, circleId, body);
        const existing = await db.collection('circle_sources').findOne({ userId: user.id, platform: source.platform, profileUrl: source.profileUrl });
        if (existing) {
          if (existing.circleId !== circleId) await db.collection('circle_sources').updateOne({ id: existing.id, userId: user.id }, { $set: { circleId, updatedAt: new Date() } });
          return json({ source: cleanMongo({ ...existing, circleId }), existing: true });
        }
        await db.collection('circle_sources').insertOne(source);
        return json({ source: cleanMongo(source) }, 201);
      }
    }

    const sourceMatch = route.match(/^\/([^/]+)\/sources\/([^/]+)$/);
    if (sourceMatch) {
      const [, circleId, sourceId] = sourceMatch;
      const source = await db.collection('circle_sources').findOne({ id: sourceId, circleId, userId: user.id });
      if (!source) return json({ error: 'Source not found' }, 404);
      if (method === 'PATCH') {
        const body = await request.json().catch(() => ({}));
        const allowed = ['displayName', 'priority', 'isMuted'];
        const changes = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
        changes.updatedAt = new Date();
        await db.collection('circle_sources').updateOne({ id: sourceId, userId: user.id }, { $set: changes });
        return json({ source: cleanMongo(await db.collection('circle_sources').findOne({ id: sourceId, userId: user.id })) });
      }
      if (method === 'DELETE') {
        await db.collection('circle_sources').deleteOne({ id: sourceId, userId: user.id });
        await db.collection('circle_updates').deleteMany({ sourceId, userId: user.id });
        return json({ ok: true });
      }
    }

    const updateStateMatch = route.match(/^\/updates\/([^/]+)\/(read|save|hide)$/);
    if (updateStateMatch && method === 'POST') {
      const updateId = updateStateMatch[1];
      const action = updateStateMatch[2];
      const update = await db.collection('circle_updates').findOne({ id: updateId, userId: user.id });
      if (!update) return json({ error: 'Update not found' }, 404);
      const field = action === 'read' ? 'isRead' : action === 'save' ? 'isSaved' : 'isHidden';
      await db.collection('circle_update_state').updateOne({ userId: user.id, updateId }, { $set: { [field]: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[circles]', error);
    const message = error?.message || 'Circles request failed';
    return json({ error: message }, /required/i.test(message) ? 400 : 500);
  }
}
