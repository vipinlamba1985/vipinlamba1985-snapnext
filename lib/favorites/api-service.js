import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { notify, setPerms } from '@/lib/favorites';
import {
  FavoritesApiError,
  buildMutualAlbumMembershipFilter,
  defaultFavoritePermissions,
  parseFavoriteAction,
  parseFavoriteId,
  parseFavoriteInvite,
  parsePermissionUpdate,
} from './api-contract.js';

function clean(doc) {
  if (!doc) return doc;
  const { _id, ...safe } = doc;
  return safe;
}

async function findParticipantConnection(db, userId, favoriteId) {
  const id = parseFavoriteId(favoriteId);
  const favorite = await db.collection('favorites').findOne({ id });
  if (!favorite) throw new FavoritesApiError('Not found', 404, 'favorite_not_found');
  if (favorite.requesterUserId !== userId && favorite.targetUserId !== userId) {
    throw new FavoritesApiError('Forbidden', 403, 'favorite_forbidden');
  }
  return favorite;
}

export async function listFavorites(user) {
  const db = await getDb();
  const all = await db.collection('favorites').find({
    $or: [{ requesterUserId: user.id }, { targetUserId: user.id }],
  }).sort({ createdAt: -1 }).toArray();

  const otherIds = [...new Set(all.map((favorite) => (
    favorite.requesterUserId === user.id ? favorite.targetUserId : favorite.requesterUserId
  )).filter(Boolean))];
  const others = otherIds.length
    ? await db.collection('users').find({ id: { $in: otherIds } }).project({ _id: 0, id: 1, name: 1, email: 1, avatarColor: 1 }).toArray()
    : [];
  const userMap = Object.fromEntries(others.map((other) => [other.id, other]));
  const enrich = (favorite) => {
    const otherId = favorite.requesterUserId === user.id ? favorite.targetUserId : favorite.requesterUserId;
    return {
      ...clean(favorite),
      other: userMap[otherId] || { id: otherId, name: 'Unknown' },
      role: favorite.requesterUserId === user.id ? 'requester' : 'target',
    };
  };

  return {
    accepted: all.filter((favorite) => favorite.status === 'accepted').map(enrich),
    incoming: all.filter((favorite) => favorite.status === 'pending' && favorite.targetUserId === user.id).map(enrich),
    outgoing: all.filter((favorite) => favorite.status === 'pending' && favorite.requesterUserId === user.id).map(enrich),
    blocked: all.filter((favorite) => favorite.status === 'blocked').map(enrich),
  };
}

export async function inviteFavorite(user, body = {}) {
  const { email } = parseFavoriteInvite(body);
  const db = await getDb();
  const target = await db.collection('users').findOne({ email });
  if (!target) {
    throw new FavoritesApiError('No SnapNext user found with that email. Ask them to sign up first.', 404, 'favorite_user_not_found');
  }
  if (target.id === user.id) {
    throw new FavoritesApiError("You can't favorite yourself", 400, 'favorite_self_not_allowed');
  }

  const existing = await db.collection('favorites').findOne({
    $or: [
      { requesterUserId: user.id, targetUserId: target.id },
      { requesterUserId: target.id, targetUserId: user.id },
    ],
  });

  if (existing?.status === 'blocked') throw new FavoritesApiError('Blocked', 403, 'favorite_blocked');
  if (existing?.status === 'accepted') return { ok: true, alreadyFavorites: true };
  if (existing?.status === 'pending') return { ok: true, alreadyPending: true };

  const now = new Date();
  if (existing) {
    await db.collection('favorites').updateOne(
      { id: existing.id },
      { $set: { status: 'pending', requesterUserId: user.id, targetUserId: target.id, updatedAt: now } },
    );
  } else {
    await db.collection('favorites').insertOne({
      id: uuidv4(),
      requesterUserId: user.id,
      targetUserId: target.id,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }

  try {
    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || ''}/favorites`;
    await sendEmail({
      template: 'favorites_invite',
      to: target.email,
      userId: target.id,
      data: { name: target.name, fromName: user.name, acceptUrl },
      prefs: target.emailPrefs,
      meta: { event: 'favorite_invite' },
    });
  } catch (error) {
    console.error('[favorites/invite] email failed', error?.message);
  }

  await notify(db, {
    userId: target.id,
    type: 'favorite_request',
    title: `${user.name} wants to be your favorite`,
    payload: { fromUserId: user.id, fromName: user.name },
  });
  return { ok: true };
}

export async function runFavoriteAction(user, favoriteId, requestedAction) {
  const action = parseFavoriteAction(requestedAction);
  const db = await getDb();
  const favorite = await findParticipantConnection(db, user.id, favoriteId);
  const otherId = favorite.requesterUserId === user.id ? favorite.targetUserId : favorite.requesterUserId;
  const now = new Date();

  if (action === 'accept') {
    if (favorite.targetUserId !== user.id || favorite.status !== 'pending') {
      throw new FavoritesApiError('Not allowed', 403, 'favorite_accept_not_allowed');
    }
    await db.collection('favorites').updateOne(
      { id: favorite.id, targetUserId: user.id, status: 'pending' },
      { $set: { status: 'accepted', acceptedAt: now, updatedAt: now } },
    );
    await notify(db, {
      userId: favorite.requesterUserId,
      type: 'favorite_accepted',
      title: `${user.name} accepted your favorite request`,
      payload: { fromUserId: user.id, fromName: user.name },
    });
    return { ok: true };
  }

  if (action === 'decline') {
    if (favorite.targetUserId !== user.id) {
      throw new FavoritesApiError('Only the recipient can decline', 403, 'favorite_decline_not_allowed');
    }
    await db.collection('favorites').updateOne(
      { id: favorite.id, targetUserId: user.id },
      { $set: { status: 'declined', updatedAt: now } },
    );
    return { ok: true };
  }

  if (action === 'cancel') {
    if (favorite.requesterUserId !== user.id || favorite.status !== 'pending') {
      throw new FavoritesApiError('Only sender can cancel pending', 403, 'favorite_cancel_not_allowed');
    }
    await db.collection('favorites').deleteOne({ id: favorite.id, requesterUserId: user.id, status: 'pending' });
    return { ok: true };
  }

  if (action === 'remove') {
    const [userAlbums, otherAlbums] = await Promise.all([
      db.collection('shared_albums').find({ $or: [{ ownerUserId: user.id }, { ownerId: user.id }] }).project({ _id: 0, id: 1 }).toArray(),
      db.collection('shared_albums').find({ $or: [{ ownerUserId: otherId }, { ownerId: otherId }] }).project({ _id: 0, id: 1 }).toArray(),
    ]);
    const albumMembershipFilter = buildMutualAlbumMembershipFilter({
      userId: user.id,
      otherId,
      userAlbumIds: userAlbums.map((album) => album.id),
      otherAlbumIds: otherAlbums.map((album) => album.id),
    });

    await Promise.all([
      db.collection('favorites').deleteOne({ id: favorite.id }),
      db.collection('favorite_permissions').deleteMany({ favoriteId: favorite.id }),
      db.collection('shared_photos').deleteMany({
        $or: [
          { ownerUserId: user.id, recipientUserId: otherId },
          { ownerUserId: otherId, recipientUserId: user.id },
          { ownerId: user.id, userId: otherId },
          { ownerId: otherId, userId: user.id },
        ],
      }),
      db.collection('shared_album_members').deleteMany(albumMembershipFilter),
      db.collection('shared_memories').deleteMany({
        $or: [
          { ownerUserId: user.id, recipientUserId: otherId },
          { ownerUserId: otherId, recipientUserId: user.id },
          { ownerId: user.id, userId: otherId },
          { ownerId: otherId, userId: user.id },
        ],
      }),
    ]);
    return { ok: true };
  }

  await db.collection('favorites').updateOne(
    { id: favorite.id },
    { $set: { status: 'blocked', blockedBy: user.id, updatedAt: now } },
  );
  return { ok: true };
}

export async function getFavoritePermissions(user, favoriteId) {
  const db = await getDb();
  const favorite = await findParticipantConnection(db, user.id, favoriteId);
  if (favorite.status !== 'accepted') {
    throw new FavoritesApiError('Sharing permissions are available after the favorite request is accepted.', 409, 'favorite_not_accepted');
  }
  const record = await db.collection('favorite_permissions').findOne({
    favoriteId: favorite.id,
    ownerUserId: user.id,
  });
  return { perms: { ...defaultFavoritePermissions(), ...(record?.perms || {}) } };
}

export async function updateFavoritePermissions(user, favoriteId, body = {}) {
  const db = await getDb();
  const favorite = await findParticipantConnection(db, user.id, favoriteId);
  if (favorite.status !== 'accepted') {
    throw new FavoritesApiError('Sharing permissions are available after the favorite request is accepted.', 409, 'favorite_not_accepted');
  }
  const updates = parsePermissionUpdate(body);
  const perms = await setPerms(db, favorite.id, user.id, updates);
  return { perms };
}
