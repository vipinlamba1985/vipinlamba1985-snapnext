import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { storage } from './storage.js';

const FILTERS = new Set(['all', 'photo', 'video', 'favorite', 'trash']);
const MEDIA_ACTIONS = new Set(['favorite', 'trash', 'restore', 'delete']);
const BULK_ACTIONS = new Set(['trash', 'restore', 'favorite', 'unfavorite', 'delete']);

const bulkSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(500),
  action: z.enum(['trash', 'restore', 'favorite', 'unfavorite', 'delete']),
});

const textSchema = z.object({
  text: z.string().trim().min(1).max(100_000),
  title: z.string().trim().max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  category: z.string().trim().min(1).max(80).optional(),
});

export class MediaLibraryServiceError extends Error {
  constructor(message, status = 400, code = 'media_request_invalid') {
    super(message);
    this.name = 'MediaLibraryServiceError';
    this.status = status;
    this.code = code;
  }
}

export function cleanMediaDocument(doc) {
  if (!doc) return doc;
  const { _id, passwordHash, ...rest } = doc;
  return rest;
}

export function normalizeMediaFilter(value) {
  const filter = String(value || 'all').trim().toLowerCase();
  return FILTERS.has(filter) ? filter : 'all';
}

export function escapeSearchPattern(value = '') {
  return String(value || '').trim().slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listUserMedia({ db, userId, filter = 'all', query = '', limit = 500 }) {
  const normalizedFilter = normalizeMediaFilter(filter);
  const search = escapeSearchPattern(query);
  const mongoQuery = { userId };

  if (normalizedFilter === 'trash') mongoQuery.trashed = true;
  else mongoQuery.trashed = { $ne: true };
  if (normalizedFilter === 'photo') mongoQuery.kind = 'photo';
  if (normalizedFilter === 'video') mongoQuery.kind = 'video';
  if (normalizedFilter === 'favorite') mongoQuery.favorite = true;

  if (search) {
    // Keep the database search contract aligned with what Magic Library users
    // can actually see and label in the UI. The regex is escaped above, so
    // user input remains literal rather than executable regex syntax.
    const searchable = [
      'name',
      'userCategory',
      'userTags',
      'people_tags',
      'people',
      'aiAnalysis.caption',
      'aiAnalysis.description',
      'aiAnalysis.tags',
      'aiAnalysis.faces',
      'aiAnalysis.people',
      'aiAnalysis.locations',
      'aiAnalysis.emotions',
      'aiAnalysis.autoAlbum',
      'aiAnalysis.contentType',
      'aiAnalysis.textInside',
    ];
    mongoQuery.$or = searchable.map(field => ({ [field]: { $regex: search, $options: 'i' } }));
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 500);
  const items = await db.collection('media')
    .find(mongoQuery)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .toArray();
  return items.map(cleanMediaDocument);
}

export async function applyMediaAction({ db, userId, id, action }) {
  const mediaId = String(id || '').trim();
  if (!mediaId || !MEDIA_ACTIONS.has(action)) {
    throw new MediaLibraryServiceError('Unsupported media action.', 400, 'media_action_invalid');
  }

  const doc = await db.collection('media').findOne({ id: mediaId, userId });
  if (!doc) throw new MediaLibraryServiceError('Media not found.', 404, 'media_not_found');

  const owned = { id: mediaId, userId };
  if (action === 'favorite') {
    await db.collection('media').updateOne(owned, { $set: { favorite: !doc.favorite } });
  } else if (action === 'trash') {
    await db.collection('media').updateOne(owned, { $set: { trashed: true, trashedAt: new Date() } });
  } else if (action === 'restore') {
    await db.collection('media').updateOne(owned, { $set: { trashed: false }, $unset: { trashedAt: '' } });
  } else if (action === 'delete') {
    await storage.delete({ provider: doc.provider || 'local', storageKey: doc.storageKey });
    await db.collection('media').deleteOne(owned);
  }

  return { ok: true };
}

export async function applyBulkMediaAction({ db, userId, body = {} }) {
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success || !BULK_ACTIONS.has(parsed.data?.action)) {
    throw new MediaLibraryServiceError('Choose at least one media item and a supported action.', 400, 'media_bulk_invalid');
  }

  const ids = [...new Set(parsed.data.ids)];
  const action = parsed.data.action;
  const filter = { id: { $in: ids }, userId };

  if (action === 'trash') {
    await db.collection('media').updateMany(filter, { $set: { trashed: true, trashedAt: new Date() } });
  } else if (action === 'restore') {
    await db.collection('media').updateMany(filter, { $set: { trashed: false }, $unset: { trashedAt: '' } });
  } else if (action === 'favorite') {
    await db.collection('media').updateMany(filter, { $set: { favorite: true } });
  } else if (action === 'unfavorite') {
    await db.collection('media').updateMany(filter, { $set: { favorite: false } });
  } else if (action === 'delete') {
    const docs = await db.collection('media').find(filter).toArray();
    for (const doc of docs) {
      await storage.delete({ provider: doc.provider || 'local', storageKey: doc.storageKey });
    }
    await db.collection('media').deleteMany(filter);
  }

  return { ok: true, affected: ids.length };
}

export async function createTextMedia({ db, userId, body = {} }) {
  const parsed = textSchema.safeParse(body);
  if (!parsed.success) {
    throw new MediaLibraryServiceError('Text content is required and must fit within the capture limits.', 400, 'media_text_invalid');
  }

  const { text, title, tags = [], category = 'Personal' } = parsed.data;
  const id = uuidv4();
  const doc = {
    id,
    userId,
    name: title || 'Quick Captures',
    size: Buffer.byteLength(text, 'utf8'),
    hash: crypto.createHash('sha256').update(text).digest('hex'),
    mime: 'text/plain',
    kind: 'text',
    storageKey: '',
    provider: 'local',
    favorite: false,
    trashed: false,
    aiAnalysis: {
      caption: text,
      tags: tags.length ? tags : ['quick-capture', category.toLowerCase()],
      autoAlbum: category,
      description: text,
      faces: [],
    },
    createdAt: new Date(),
  };
  await db.collection('media').insertOne(doc);
  return cleanMediaDocument(doc);
}
