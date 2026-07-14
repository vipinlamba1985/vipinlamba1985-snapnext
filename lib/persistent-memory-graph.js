import crypto from 'node:crypto';
import { buildMemoryIndex, buildEventGroups } from '@/lib/memory-brain';

function key(type, value) { return `${type}:${String(value || '').trim().toLowerCase()}`; }
function addNode(nodes, node) { if (!node?.id || nodes.has(node.id)) return; nodes.set(node.id, node); }
function addEdge(edges, from, to, type, evidenceId, weight = 1) {
  if (!from || !to || from === to) return;
  const id = [from, type, to].join('|');
  const current = edges.get(id) || { id, from, to, type, weight: 0, evidenceIds: [] };
  current.weight += weight;
  if (evidenceId && current.evidenceIds.length < 25 && !current.evidenceIds.includes(evidenceId)) current.evidenceIds.push(evidenceId);
  edges.set(id, current);
}

export function memoryGraphFingerprint(mediaItems = [], context = {}) {
  const source = mediaItems.map((item) => [item.id, item.updatedAt || item.createdAt, item.aiAnalysis?.updatedAt || null]);
  const labels = [
    ...(context.relationships || []).map((item) => [item.id || item.personName, item.updatedAt, item.relationship]),
    ...(context.events || []).map((item) => [item.id || item.name, item.updatedAt, (item.memoryIds || []).length]),
  ];
  return crypto.createHash('sha256').update(JSON.stringify([source, labels])).digest('hex');
}

export function buildPersistentMemoryGraph(mediaItems = [], context = {}) {
  const nodes = new Map();
  const edges = new Map();
  const indexes = mediaItems.map(buildMemoryIndex);
  const confirmedEvents = context.events || [];
  const derivedEvents = buildEventGroups(mediaItems, { minimumItems: 2, limit: 100 });
  const relationshipByPerson = new Map((context.relationships || []).map((item) => [String(item.personName || item.name || '').toLowerCase(), item]));

  for (const item of indexes) {
    const mediaId = key('memory', item.id);
    addNode(nodes, { id: mediaId, type: 'memory', refId: item.id, label: item.name || 'Saved memory', kind: item.kind, createdAt: item.createdAt, score: item.qualityScore });

    for (const person of item.people) {
      const personId = key('person', person);
      const confirmed = relationshipByPerson.get(String(person).toLowerCase());
      addNode(nodes, { id: personId, type: 'person', label: person, relationship: confirmed?.relationship || null, confirmed: !!confirmed });
      addEdge(edges, mediaId, personId, 'contains_person', item.id);
    }
    for (const location of item.locations) {
      const locationId = key('location', location);
      addNode(nodes, { id: locationId, type: 'location', label: location });
      addEdge(edges, mediaId, locationId, 'captured_at', item.id);
    }
    for (const tag of item.tags.slice(0, 20)) {
      const tagId = key('tag', tag);
      addNode(nodes, { id: tagId, type: 'tag', label: tag });
      addEdge(edges, mediaId, tagId, 'has_tag', item.id);
    }
    if (item.album) {
      const albumId = key('album', item.album);
      addNode(nodes, { id: albumId, type: 'album', label: item.album });
      addEdge(edges, mediaId, albumId, 'belongs_to_album', item.id);
    }
  }

  const allEvents = confirmedEvents.length ? confirmedEvents : derivedEvents;
  for (const event of allEvents) {
    const label = event.name || event.title || 'Memory event';
    const eventId = key('event', event.id || label);
    addNode(nodes, { id: eventId, type: 'event', label, confirmed: confirmedEvents.includes(event), startAt: event.startAt || null, endAt: event.endAt || null });
    for (const memoryId of event.memoryIds || []) addEdge(edges, key('memory', memoryId), eventId, 'belongs_to_event', memoryId);
  }

  const peopleByMemory = indexes.map((item) => item.people.map((person) => key('person', person)));
  for (let m = 0; m < peopleByMemory.length; m += 1) {
    const people = peopleByMemory[m];
    for (let i = 0; i < people.length; i += 1) for (let j = i + 1; j < people.length; j += 1) {
      addEdge(edges, people[i], people[j], 'appears_with', indexes[m].id);
      addEdge(edges, people[j], people[i], 'appears_with', indexes[m].id);
    }
  }

  const nodeList = [...nodes.values()];
  const edgeList = [...edges.values()].sort((a, b) => b.weight - a.weight);
  return {
    version: 1,
    generatedAt: new Date(),
    totals: {
      nodes: nodeList.length,
      edges: edgeList.length,
      memories: nodeList.filter((node) => node.type === 'memory').length,
      people: nodeList.filter((node) => node.type === 'person').length,
      events: nodeList.filter((node) => node.type === 'event').length,
      locations: nodeList.filter((node) => node.type === 'location').length,
    },
    nodes: nodeList,
    edges: edgeList,
  };
}

export async function persistMemoryGraph(db, userId, mediaItems, context) {
  const fingerprint = memoryGraphFingerprint(mediaItems, context);
  const existing = await db.collection('memory_graph_snapshots').findOne({ userId, fingerprint });
  if (existing) return { ...existing, cached: true };
  const graph = buildPersistentMemoryGraph(mediaItems, context);
  const document = { userId, fingerprint, ...graph, updatedAt: new Date() };
  await db.collection('memory_graph_snapshots').updateOne({ userId }, { $set: document, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  return { ...document, cached: false };
}
