import { z } from 'zod';

// "Trusted circle" is the people-sharing concept: who you allow to see your
// memories. It is deliberately NOT the same thing as a starred photo
// (`media.favorite`), which is a per-item bookmark inside your own library.
// The MongoDB collections (`favorites`, `favorite_permissions`) and the stored
// notification types (`favorite_request`, `favorite_accepted`) keep their
// historical names so existing documents stay readable; everything callers
// touch uses the trusted-circle vocabulary.
export const TRUSTED_CIRCLE_ACTIONS = ['accept', 'decline', 'cancel', 'remove', 'block'];
export const TRUSTED_CIRCLE_PERMISSION_KEYS = [
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

export class TrustedCircleApiError extends Error {
  constructor(message, status = 400, code = 'trusted_circle_request_invalid') {
    super(message);
    this.name = 'TrustedCircleApiError';
    this.status = status;
    this.code = code;
  }
}

export function parseTrustedConnectionId(value) {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new TrustedCircleApiError('Trusted connection not found.', 404, 'trusted_connection_not_found');
  return parsed.data;
}

export function parseTrustedCircleAction(value) {
  if (!TRUSTED_CIRCLE_ACTIONS.includes(value)) {
    throw new TrustedCircleApiError('Unsupported trusted circle action.', 400, 'trusted_action_invalid');
  }
  return value;
}

export function parseTrustedCircleInvite(body = {}) {
  const parsed = inviteSchema.safeParse(body || {});
  if (!parsed.success) throw new TrustedCircleApiError('Enter a valid email address.', 400, 'trusted_email_invalid');
  const needle = String(parsed.data.email || parsed.data.query || '').trim().toLowerCase();
  if (!needle) throw new TrustedCircleApiError('Email required', 400, 'trusted_email_required');
  const emailCheck = z.string().email().safeParse(needle);
  if (!emailCheck.success) throw new TrustedCircleApiError('Enter a valid email address.', 400, 'trusted_email_invalid');
  return { email: needle };
}

export function parsePermissionUpdate(body = {}) {
  const parsed = permissionSchema.safeParse(body || {});
  if (!parsed.success) throw new TrustedCircleApiError('Invalid sharing permissions.', 400, 'trusted_permissions_invalid');
  const updates = parsed.data;
  if (!Object.keys(updates).length) {
    throw new TrustedCircleApiError('Choose a sharing permission to update.', 400, 'trusted_permissions_empty');
  }
  return updates;
}

export function defaultTrustedCirclePermissions() {
  return Object.fromEntries(TRUSTED_CIRCLE_PERMISSION_KEYS.map((key) => [key, key !== 'shareFuturePhotos']));
}

export function buildMutualAlbumMembershipFilter({ userId, otherId, userAlbumIds = [], otherAlbumIds = [] }) {
  const userAlbums = [...new Set(userAlbumIds.filter(Boolean))];
  const otherAlbums = [...new Set(otherAlbumIds.filter(Boolean))];
  const clauses = [];
  if (userAlbums.length) clauses.push({ albumId: { $in: userAlbums }, favoriteUserId: otherId });
  if (otherAlbums.length) clauses.push({ albumId: { $in: otherAlbums }, favoriteUserId: userId });
  return clauses.length ? { $or: clauses } : { albumId: { $in: [] } };
}
