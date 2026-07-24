import { z } from 'zod';

export const FAVORITE_ACTIONS = ['accept', 'decline', 'cancel', 'remove', 'block'];
export const FAVORITE_PERMISSION_KEYS = [
  'shareSharedPhotos',
  'shareAlbums',
  'shareMemories',
  'shareFuturePhotos',
  'shareProfilePicture',
];

const idSchema = z.string().trim().min(1).max(160);
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320).optional(),
  query: z.string().trim().toLowerCase().max(320).optional(),
});
const permissionSchema = z.object({
  shareSharedPhotos: z.boolean().optional(),
  shareAlbums: z.boolean().optional(),
  shareMemories: z.boolean().optional(),
  shareFuturePhotos: z.boolean().optional(),
  shareProfilePicture: z.boolean().optional(),
}).strip();

export class FavoritesApiError extends Error {
  constructor(message, status = 400, code = 'favorites_request_invalid') {
    super(message);
    this.name = 'FavoritesApiError';
    this.status = status;
    this.code = code;
  }
}

export function parseFavoriteId(value) {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new FavoritesApiError('Favorite connection not found.', 404, 'favorite_not_found');
  return parsed.data;
}

export function parseFavoriteAction(value) {
  if (!FAVORITE_ACTIONS.includes(value)) {
    throw new FavoritesApiError('Unsupported favorite action.', 400, 'favorite_action_invalid');
  }
  return value;
}

export function parseFavoriteInvite(body = {}) {
  const parsed = inviteSchema.safeParse(body || {});
  if (!parsed.success) throw new FavoritesApiError('Enter a valid email address.', 400, 'favorite_email_invalid');
  const needle = String(parsed.data.email || parsed.data.query || '').trim().toLowerCase();
  if (!needle) throw new FavoritesApiError('Email required', 400, 'favorite_email_required');
  const emailCheck = z.string().email().safeParse(needle);
  if (!emailCheck.success) throw new FavoritesApiError('Enter a valid email address.', 400, 'favorite_email_invalid');
  return { email: needle };
}

export function parsePermissionUpdate(body = {}) {
  const parsed = permissionSchema.safeParse(body || {});
  if (!parsed.success) throw new FavoritesApiError('Invalid sharing permissions.', 400, 'favorite_permissions_invalid');
  const updates = parsed.data;
  if (!Object.keys(updates).length) {
    throw new FavoritesApiError('Choose a sharing permission to update.', 400, 'favorite_permissions_empty');
  }
  return updates;
}

export function defaultFavoritePermissions() {
  return Object.fromEntries(FAVORITE_PERMISSION_KEYS.map((key) => [key, key !== 'shareFuturePhotos']));
}
