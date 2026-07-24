import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(160);
const idsSchema = z.array(idSchema).min(1).max(500).transform((ids) => [...new Set(ids)]);
const titleSchema = z.string().trim().min(1).max(180);

export const ALBUM_ACTIONS = ['invite', 'remove-member', 'add-media', 'remove-media', 'delete'];

export class SharingApiError extends Error {
  constructor(message, status = 400, code = 'sharing_request_invalid') {
    super(message);
    this.name = 'SharingApiError';
    this.status = status;
    this.code = code;
  }
}

export function parseSharePhotosInput(body = {}) {
  const parsed = z.object({ recipientUserId: idSchema, mediaIds: idsSchema }).safeParse(body || {});
  if (!parsed.success) {
    throw new SharingApiError('recipientUserId and mediaIds required', 400, 'shared_photos_invalid');
  }
  return parsed.data;
}

export function parseAlbumName(body = {}) {
  const parsed = z.object({ name: titleSchema }).safeParse(body || {});
  if (!parsed.success) throw new SharingApiError('Name required', 400, 'shared_album_name_required');
  return parsed.data;
}

export function parseAlbumId(value) {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new SharingApiError('Album not found', 404, 'shared_album_not_found');
  return parsed.data;
}

export function parseAlbumAction(value) {
  if (!ALBUM_ACTIONS.includes(value)) {
    throw new SharingApiError('Unsupported album action', 400, 'shared_album_action_invalid');
  }
  return value;
}

export function parseAlbumActionInput(action, body = {}) {
  if (action === 'delete') return {};
  if (action === 'invite' || action === 'remove-member') {
    const parsed = z.object({ favoriteUserId: idSchema }).safeParse(body || {});
    if (!parsed.success) throw new SharingApiError('favoriteUserId required', 400, 'shared_album_member_required');
    return parsed.data;
  }
  const parsed = z.object({ mediaIds: idsSchema }).safeParse(body || {});
  if (!parsed.success) throw new SharingApiError('mediaIds required', 400, 'shared_album_media_required');
  return parsed.data;
}

export function parseShareMemoryInput(body = {}) {
  const parsed = z.object({
    title: titleSchema,
    recipientUserId: idSchema,
    mediaIds: idsSchema,
  }).safeParse(body || {});
  if (!parsed.success) {
    throw new SharingApiError('title, recipientUserId, mediaIds required', 400, 'shared_memory_invalid');
  }
  return parsed.data;
}

export function parseReactionInput(body = {}) {
  const value = typeof body?.emoji === 'string' ? body.emoji.trim() : '';
  const emoji = value || '❤️';
  if (emoji.length > 24) throw new SharingApiError('Reaction is too long', 400, 'shared_memory_reaction_invalid');
  return { emoji };
}
