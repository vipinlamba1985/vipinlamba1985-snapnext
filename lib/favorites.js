// Favorites helpers — permission resolution + shared-content visibility.
// Every server endpoint that returns shared data MUST go through these helpers.
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_PERMS = {
  shareSharedPhotos: true,
  shareAlbums: true,
  shareMemories: true,
  shareFuturePhotos: false,
  shareProfilePicture: true,
};

/**
 * Looks up an accepted favorite link between two users (in either direction)
 * and returns { favorite, ownerPerms, theirPerms } or null when no accepted
 * link exists.
 */
export async function getFavoriteLink(db, userIdA, userIdB) {
  if (!userIdA || !userIdB || userIdA === userIdB) return null;
  const fav = await db.collection('favorites').findOne({
    status: 'accepted',
    $or: [
      { requesterUserId: userIdA, targetUserId: userIdB },
      { requesterUserId: userIdB, targetUserId: userIdA },
    ],
  });
  if (!fav) return null;
  // Permissions are per-owner: each user controls what THEIR side shares.
  const aPerms = await loadPerms(db, fav.id, userIdA);
  const bPerms = await loadPerms(db, fav.id, userIdB);
  return { favorite: fav, permsByOwner: { [userIdA]: aPerms, [userIdB]: bPerms } };
}

async function loadPerms(db, favoriteId, ownerUserId) {
  const rec = await db.collection('favorite_permissions').findOne({ favoriteId, ownerUserId });
  return { ...DEFAULT_PERMS, ...(rec?.perms || {}) };
}

export async function setPerms(db, favoriteId, ownerUserId, partial) {
  const allowed = ['shareSharedPhotos', 'shareAlbums', 'shareMemories', 'shareFuturePhotos', 'shareProfilePicture'];
  const update = {};
  for (const k of allowed) if (k in partial) update[`perms.${k}`] = !!partial[k];
  if (!Object.keys(update).length) return null;
  await db.collection('favorite_permissions').updateOne(
    { favoriteId, ownerUserId },
    { $set: { ...update, updatedAt: new Date() }, $setOnInsert: { id: uuidv4(), favoriteId, ownerUserId, createdAt: new Date() } },
    { upsert: true },
  );
  return loadPerms(db, favoriteId, ownerUserId);
}

/** True if `viewerId` may see a specific shared resource owned by `ownerId`. */
export async function canViewOwnersResource(db, viewerId, ownerId, permKey) {
  const link = await getFavoriteLink(db, viewerId, ownerId);
  if (!link) return false;
  const perms = link.permsByOwner[ownerId];
  return !!perms[permKey];
}

export async function listAcceptedFavoriteUserIds(db, userId) {
  const favs = await db.collection('favorites').find({
    status: 'accepted',
    $or: [{ requesterUserId: userId }, { targetUserId: userId }],
  }).toArray();
  return favs.map(f => f.requesterUserId === userId ? f.targetUserId : f.requesterUserId);
}

export async function notify(db, { userId, type, title, body = '', payload = {} }) {
  await db.collection('notifications').insertOne({
    id: uuidv4(), userId, type, title, body, payload, read: false, createdAt: new Date(),
  });
}

export const FAVORITE_PERM_KEYS = Object.keys(DEFAULT_PERMS);
