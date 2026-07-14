import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { loadMemoryContext } from '@/lib/memory-context';
import { publishIntelligenceEvent } from '@/lib/intelligence-event-bus';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function text(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function stringList(value, maxItems = 20, maxLength = 100) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

async function verifyMemoryIds(db, userId, memoryIds) {
  const ids = stringList(memoryIds, 2000, 100);
  if (!ids.length) return [];
  const existing = await db.collection('media').find({ userId, id: { $in: ids }, trashed: { $ne: true } }).project({ id: 1 }).toArray();
  return existing.map((item) => item.id);
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const context = await loadMemoryContext(db, user.id);
  return json({
    relationships: context.relationships.map(({ _id, userId, ...item }) => item),
    events: context.events.map(({ _id, userId, ...item }) => item),
    privacy: 'Only labels and events confirmed by this account are used.',
  });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const type = body.type === 'event' ? 'event' : 'relationship';
  const db = await getDb();
  const now = new Date();

  if (type === 'relationship') {
    const personName = text(body.personName);
    const relationship = text(body.relationship, 60).toLowerCase();
    if (!personName || !relationship) return json({ error: 'Person name and relationship are required.' }, 400);
    const existing = await db.collection('memory_relationships').findOne({ userId: user.id, personName: { $regex: `^${personName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, deleted: { $ne: true } });
    const id = existing?.id || randomUUID();
    const doc = {
      id,
      userId: user.id,
      personName,
      displayName: text(body.displayName || personName),
      relationship,
      aliases: stringList(body.aliases, 12, 80),
      notes: text(body.notes, 500),
      source: 'user_confirmed',
      updatedAt: now,
      ...(existing ? {} : { createdAt: now }),
    };
    await db.collection('memory_relationships').updateOne({ userId: user.id, id }, { $set: doc }, { upsert: true });
    await publishIntelligenceEvent(db, user.id, 'memory.relationship_changed', { entityId: id, entityType: 'relationship', action: existing ? 'updated' : 'created', source: 'user_confirmed' });
    return json({ ok: true, relationship: Object.fromEntries(Object.entries(doc).filter(([key]) => key !== 'userId')) });
  }

  const title = text(body.title);
  if (!title) return json({ error: 'Event title is required.' }, 400);
  const memoryIds = await verifyMemoryIds(db, user.id, body.memoryIds);
  const id = text(body.id, 100) || randomUUID();
  const existing = await db.collection('memory_events').findOne({ userId: user.id, id });
  const doc = {
    id,
    userId: user.id,
    title,
    aliases: stringList(body.aliases, 12, 100),
    startAt: body.startAt ? new Date(body.startAt) : null,
    endAt: body.endAt ? new Date(body.endAt) : null,
    memoryIds,
    tags: stringList(body.tags, 30, 60),
    locations: stringList(body.locations, 20, 100),
    notes: text(body.notes, 1000),
    source: 'user_confirmed',
    updatedAt: now,
    ...(existing ? {} : { createdAt: now }),
  };
  await db.collection('memory_events').updateOne({ userId: user.id, id }, { $set: doc }, { upsert: true });
  await publishIntelligenceEvent(db, user.id, 'memory.event_changed', { entityId: id, entityType: 'event', action: existing ? 'updated' : 'created', memoryCount: memoryIds.length, source: 'user_confirmed' });
  return json({ ok: true, event: Object.fromEntries(Object.entries(doc).filter(([key]) => key !== 'userId')) });
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const id = text(body.id, 100);
  const type = body.type === 'event' ? 'event' : 'relationship';
  if (!id) return json({ error: 'ID is required.' }, 400);
  const db = await getDb();
  const collection = type === 'event' ? 'memory_events' : 'memory_relationships';
  const result = await db.collection(collection).updateOne({ userId: user.id, id }, { $set: { deleted: true, deletedAt: new Date(), updatedAt: new Date() } });
  if (!result.matchedCount) return json({ error: 'Not found.' }, 404);
  await publishIntelligenceEvent(db, user.id, type === 'event' ? 'memory.event_changed' : 'memory.relationship_changed', { entityId: id, entityType: type, action: 'deleted', source: 'user_confirmed' });
  return json({ ok: true });
}
