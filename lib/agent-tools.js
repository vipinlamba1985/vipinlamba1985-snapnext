import { v4 as uuidv4 } from 'uuid';

const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

function text(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function stringArray(value, max = 50, itemMax = 120) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, itemMax)).filter(Boolean))].slice(0, max);
}

function dueDate(value) {
  const raw = text(value, 80);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed;
}

export const AGENT_TOOL_DEFINITIONS = {
  create_task: {
    risk: 'low',
    approvalRequired: true,
    reversible: true,
    description: 'Create a private SnapNext task for the current user.',
  },
  complete_task: {
    risk: 'low',
    approvalRequired: true,
    reversible: true,
    description: 'Mark one owned SnapNext task complete.',
  },
  create_reminder: {
    risk: 'low',
    approvalRequired: true,
    reversible: true,
    description: 'Create a private reminder inside SnapNext.',
  },
  create_collection: {
    risk: 'low',
    approvalRequired: true,
    reversible: true,
    description: 'Create a private smart collection inside SnapNext.',
  },
  add_assets_to_collection: {
    risk: 'low',
    approvalRequired: true,
    reversible: true,
    description: 'Add owned assets to an owned SnapNext collection.',
  },
  prepare_social_post: {
    risk: 'low',
    approvalRequired: true,
    reversible: true,
    description: 'Save a private social-post draft. It does not publish anything.',
  },
};

export function listAgentTools() {
  return Object.entries(AGENT_TOOL_DEFINITIONS).map(([name, definition]) => ({ name, ...definition }));
}

export function normalizeAgentToolInput(toolName, input = {}) {
  if (!AGENT_TOOL_DEFINITIONS[toolName]) throw new Error('Unsupported agent tool.');

  if (toolName === 'create_task') {
    const title = text(input.title, 220);
    if (!title) throw new Error('Task title is required.');
    return {
      title,
      notes: text(input.notes, 1200) || null,
      priority: PRIORITIES.has(text(input.priority, 20).toLowerCase()) ? text(input.priority, 20).toLowerCase() : 'medium',
      dueDate: dueDate(input.dueDate),
      sourceMediaIds: stringArray(input.sourceMediaIds, 20),
    };
  }

  if (toolName === 'complete_task') {
    const taskId = text(input.taskId, 120);
    if (!taskId) throw new Error('Task id is required.');
    return { taskId };
  }

  if (toolName === 'create_reminder') {
    const title = text(input.title, 220);
    const remindAt = dueDate(input.remindAt);
    if (!title || !remindAt) throw new Error('Reminder title and time are required.');
    return {
      title,
      remindAt,
      notes: text(input.notes, 1200) || null,
      sourceMediaIds: stringArray(input.sourceMediaIds, 20),
    };
  }

  if (toolName === 'create_collection') {
    const name = text(input.name, 120);
    if (!name) throw new Error('Collection name is required.');
    return {
      name,
      description: text(input.description, 800) || null,
      sourceMediaIds: stringArray(input.sourceMediaIds, 50),
    };
  }

  if (toolName === 'add_assets_to_collection') {
    const collectionId = text(input.collectionId, 120);
    const mediaIds = stringArray(input.mediaIds, 100);
    if (!collectionId || !mediaIds.length) throw new Error('Collection id and media ids are required.');
    return { collectionId, mediaIds };
  }

  if (toolName === 'prepare_social_post') {
    const caption = text(input.caption, 4000);
    if (!caption) throw new Error('Draft caption is required.');
    return {
      caption,
      hashtags: stringArray(input.hashtags, 30, 80),
      mediaIds: stringArray(input.mediaIds, 20),
      platform: text(input.platform, 40).toLowerCase() || 'general',
    };
  }

  throw new Error('Unsupported agent tool.');
}

async function verifyOwnedMedia(db, userId, mediaIds) {
  if (!mediaIds.length) return [];
  const owned = await db.collection('media').find({
    userId,
    id: { $in: mediaIds },
    trashed: { $ne: true },
  }, { projection: { id: 1 } }).toArray();
  if (owned.length !== mediaIds.length) throw new Error('One or more selected assets are not available.');
  return mediaIds;
}

export async function executeAgentTool({ db, userId, toolName, input, actionId }) {
  const now = new Date();
  const args = normalizeAgentToolInput(toolName, input);

  if (toolName === 'create_task') {
    await verifyOwnedMedia(db, userId, args.sourceMediaIds);
    const task = { id: uuidv4(), userId, ...args, status: 'open', source: 'snapnext_agent', actionId, createdAt: now, updatedAt: now };
    await db.collection('agent_tasks').insertOne(task);
    return { type: 'task', id: task.id, title: task.title, status: task.status };
  }

  if (toolName === 'complete_task') {
    const task = await db.collection('agent_tasks').findOneAndUpdate(
      { id: args.taskId, userId },
      { $set: { status: 'completed', completedAt: now, updatedAt: now, completedByActionId: actionId } },
      { returnDocument: 'after' },
    );
    if (!task) throw new Error('Task not found.');
    return { type: 'task', id: task.id, title: task.title, status: task.status };
  }

  if (toolName === 'create_reminder') {
    await verifyOwnedMedia(db, userId, args.sourceMediaIds);
    const reminder = { id: uuidv4(), userId, ...args, status: 'scheduled', source: 'snapnext_agent', actionId, createdAt: now, updatedAt: now };
    await db.collection('agent_reminders').insertOne(reminder);
    return { type: 'reminder', id: reminder.id, title: reminder.title, remindAt: reminder.remindAt, status: reminder.status };
  }

  if (toolName === 'create_collection') {
    await verifyOwnedMedia(db, userId, args.sourceMediaIds);
    const collection = { id: uuidv4(), userId, name: args.name, description: args.description, mediaIds: args.sourceMediaIds, source: 'snapnext_agent', actionId, createdAt: now, updatedAt: now };
    await db.collection('agent_collections').insertOne(collection);
    return { type: 'collection', id: collection.id, name: collection.name, itemCount: collection.mediaIds.length };
  }

  if (toolName === 'add_assets_to_collection') {
    await verifyOwnedMedia(db, userId, args.mediaIds);
    const collection = await db.collection('agent_collections').findOneAndUpdate(
      { id: args.collectionId, userId },
      { $addToSet: { mediaIds: { $each: args.mediaIds } }, $set: { updatedAt: now, lastActionId: actionId } },
      { returnDocument: 'after' },
    );
    if (!collection) throw new Error('Collection not found.');
    return { type: 'collection', id: collection.id, name: collection.name, itemCount: collection.mediaIds?.length || 0 };
  }

  if (toolName === 'prepare_social_post') {
    await verifyOwnedMedia(db, userId, args.mediaIds);
    const draft = { id: uuidv4(), userId, ...args, status: 'draft', published: false, source: 'snapnext_agent', actionId, createdAt: now, updatedAt: now };
    await db.collection('agent_drafts').insertOne(draft);
    return { type: 'social_draft', id: draft.id, status: draft.status, platform: draft.platform };
  }

  throw new Error('Unsupported agent tool.');
}
