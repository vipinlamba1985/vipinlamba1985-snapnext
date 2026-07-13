export function normalizeMemoryLabel(value) {
  return String(value || '').trim().toLowerCase();
}

export async function loadMemoryContext(db, userId) {
  const relationships = await db.collection('memory_relationships')
    .find({ userId, deleted: { $ne: true } })
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray();

  const events = await db.collection('memory_events')
    .find({ userId, deleted: { $ne: true } })
    .sort({ startAt: -1, updatedAt: -1 })
    .limit(200)
    .toArray();

  return { relationships, events };
}

export function resolveQueryContext(query, context = {}) {
  const q = normalizeMemoryLabel(query);
  const terms = new Set();
  const matchedRelationships = [];
  const matchedEvents = [];

  for (const item of context.relationships || []) {
    const aliases = [item.relationship, item.displayName, item.personName, ...(item.aliases || [])]
      .map(normalizeMemoryLabel)
      .filter(Boolean);
    if (aliases.some((alias) => q.includes(alias))) {
      matchedRelationships.push(item);
      if (item.personName) terms.add(item.personName);
      if (item.displayName) terms.add(item.displayName);
    }
  }

  for (const event of context.events || []) {
    const aliases = [event.title, ...(event.aliases || [])]
      .map(normalizeMemoryLabel)
      .filter(Boolean);
    if (aliases.some((alias) => q.includes(alias))) {
      matchedEvents.push(event);
      if (event.title) terms.add(event.title);
      for (const tag of event.tags || []) terms.add(tag);
      for (const location of event.locations || []) terms.add(location);
    }
  }

  return {
    expandedQuery: [query, ...terms].filter(Boolean).join(' '),
    matchedRelationships: matchedRelationships.map(({ id, personName, displayName, relationship }) => ({ id, personName, displayName, relationship })),
    matchedEvents: matchedEvents.map(({ id, title, startAt, endAt, memoryIds = [] }) => ({ id, title, startAt, endAt, memoryIds })),
  };
}
