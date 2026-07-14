import { createHash, randomUUID } from 'node:crypto';

const ALLOWED_TYPES = new Set([
  'media.library_changed',
  'memory.relationship_changed',
  'memory.event_changed',
  'learning.preference_changed',
]);

function clean(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function safePayload(payload = {}) {
  const result = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (!/^(id|count|action|source|latestAt|entityType|entityId|memoryCount)$/.test(key)) continue;
    if (typeof value === 'number' || typeof value === 'boolean') result[key] = value;
    else if (value != null) result[key] = clean(value, 160);
  }
  return result;
}

function dedupeKey(userId, type, payload) {
  return createHash('sha256').update(JSON.stringify([userId, type, payload])).digest('hex');
}

export async function publishIntelligenceEvent(db, userId, type, payload = {}) {
  if (!userId || !ALLOWED_TYPES.has(type)) return { published: false };
  const safe = safePayload(payload);
  const now = new Date();
  const bucket = new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString();
  const dedupe = dedupeKey(userId, type, { ...safe, bucket });
  const event = {
    id: randomUUID(), userId, type, payload: safe, dedupe,
    status: 'pending', attempts: 0, createdAt: now, updatedAt: now,
  };
  const result = await db.collection('intelligence_events').updateOne(
    { userId, dedupe },
    { $setOnInsert: event },
    { upsert: true },
  );
  await invalidateIntelligenceCaches(db, userId, type, now);
  return { published: !!result.upsertedCount, eventId: event.id };
}

export async function invalidateIntelligenceCaches(db, userId, type, at = new Date()) {
  const invalidations = {
    memoryGraph: ['media.library_changed', 'memory.relationship_changed', 'memory.event_changed'].includes(type),
    recommendations: true,
    timeline: ['media.library_changed', 'memory.event_changed'].includes(type),
    context: true,
  };
  await db.collection('intelligence_cache_state').updateOne(
    { userId },
    { $set: { userId, invalidations, lastEventType: type, invalidatedAt: at, updatedAt: at }, $setOnInsert: { createdAt: at } },
    { upsert: true },
  );
  return invalidations;
}

export async function reconcileMediaLibraryEvent(db, userId, items = []) {
  const latestAt = items[0]?.updatedAt || items[0]?.createdAt || null;
  const signature = createHash('sha256').update(JSON.stringify([items.length, latestAt])).digest('hex');
  const state = await db.collection('intelligence_source_state').findOne({ userId });
  if (state?.mediaSignature === signature) return { changed: false };
  await db.collection('intelligence_source_state').updateOne(
    { userId },
    { $set: { userId, mediaSignature: signature, mediaCount: items.length, latestAt, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  await publishIntelligenceEvent(db, userId, 'media.library_changed', { count: items.length, latestAt, source: 'context_reconciliation' });
  return { changed: true };
}
