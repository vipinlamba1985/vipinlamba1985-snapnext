import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { canViewOwnersResource, getFavoriteLink, notify } from '@/lib/favorites';
import {
  SharingApiError,
  parseAlbumAction,
  parseAlbumActionInput,
  parseAlbumId,
  parseAlbumName,
  parseReactionInput,
  parseShareMemoryInput,
  parseSharePhotosInput,
} from './api-contract.js';

function clean(doc) {
  if (!doc) return doc;
  const { _id, ...safe } = doc;
  return safe;
}

function ownerIdOf(record = {}) {
  return record.ownerUserId || record.ownerId || null;
}

function recipientIdOf(record = {}) {
  return record.recipientUserId || record.userId || null;
}

export async function sharePhotos(user, body = {}) {
  const { mediaIds, recipientUserId } = parseSharePhotosInput(body);
  const db = await getDb();
  const link = await getFavoriteLink(db, user.id, recipientUserId);
  if (!link) throw new SharingApiError('Not connected as favorites', 403, 'sharing_favorite_required');

  const mediaDocs = await db.collection('media').find({
    id: { $in: mediaIds },
    userId: user.id,
    trashed: { $ne: true },
  }).project({ _id: 0, id: 1 }).toArray();
  const allowed = mediaDocs.map((media) => media.id);
  if (!allowed.length) throw new SharingApiError('No owned photos were available to share', 403, 'shared_photos_not_owned');

  const now = new Date();
  await Promise.all(allowed.map((mediaId) => db.collection('shared_photos').updateOne(
    { ownerUserId: user.id, recipientUserId, mediaId },
    { $setOnInsert: { id: uuidv4(), ownerUserId: user.id, recipientUserId, mediaId, sharedAt: now } },
    { upsert: true },
  )));

  await notify(db, {
    userId: recipientUserId,
    type: 'photos_shared',
    title: `${user.name} shared ${allowed.length} ${allowed.length === 1 ? 'photo' : 'photos'} with you`,
    payload: { count: allowed.length, fromUserId: user.id, fromName: user.name },
  });
  return { ok: true, shared: allowed.length };
}

export async function listSharedPhotos(user) {
  const db = await getDb();
  const rows = await db.collection('shared_photos').find({
    $or: [{ recipientUserId: user.id }, { userId: user.id }],
  }).sort({ sharedAt: -1 }).toArray();

  const permissionCache = {};
  const allowedRows = [];
  for (const row of rows) {
    const ownerId = ownerIdOf(row);
    if (!ownerId || recipientIdOf(row) !== user.id) continue;
    if (permissionCache[ownerId] === undefined) {
      permissionCache[ownerId] = await canViewOwnersResource(db, user.id, ownerId, 'shareSharedPhotos');
    }
    if (permissionCache[ownerId]) allowedRows.push({ ...row, ownerUserId: ownerId });
  }

  const mediaIds = [...new Set(allowedRows.map((row) => row.mediaId).filter(Boolean))];
  const media = mediaIds.length
    ? await db.collection('media').find({ id: { $in: mediaIds }, trashed: { $ne: true } }).toArray()
    : [];
  const mediaMap = Object.fromEntries(media.map((item) => [item.id, item]));
  const ownerIds = [...new Set(allowedRows.map((row) => row.ownerUserId))];
  const owners = ownerIds.length
    ? await db.collection('users').find({ id: { $in: ownerIds } }).project({ _id: 0, id: 1, name: 1, avatarColor: 1 }).toArray()
    : [];
  const ownerMap = Object.fromEntries(owners.map((owner) => [owner.id, owner]));

  const items = allowedRows.map((row) => {
    const mediaItem = mediaMap[row.mediaId];
    if (!mediaItem || mediaItem.userId !== row.ownerUserId) return null;
    return { ...clean(row), media: clean(mediaItem), owner: ownerMap[row.ownerUserId] };
  }).filter(Boolean);
  return { items };
}

export async function listSharedAlbums(user) {
  const db = await getDb();
  const owned = await db.collection('shared_albums').find({
    $or: [{ ownerUserId: user.id }, { ownerId: user.id }],
  }).sort({ createdAt: -1 }).toArray();
  const memberships = await db.collection('shared_album_members').find({ favoriteUserId: user.id }).toArray();
  const ids = [...new Set(memberships.map((membership) => membership.albumId).filter(Boolean))];
  const raw = ids.length ? await db.collection('shared_albums').find({ id: { $in: ids } }).toArray() : [];
  const shared = [];
  for (const album of raw) {
    const ownerId = ownerIdOf(album);
    if (ownerId && await canViewOwnersResource(db, user.id, ownerId, 'shareAlbums')) {
      shared.push({ ...album, ownerUserId: ownerId });
    }
  }
  return { owned: owned.map(clean), shared: shared.map(clean) };
}

export async function createSharedAlbum(user, body = {}) {
  const { name } = parseAlbumName(body);
  const db = await getDb();
  const now = new Date();
  const album = { id: uuidv4(), ownerUserId: user.id, name, createdAt: now, updatedAt: now };
  await db.collection('shared_albums').insertOne(album);
  return { album: clean(album) };
}

export async function getSharedAlbum(user, albumId) {
  const id = parseAlbumId(albumId);
  const db = await getDb();
  const album = await db.collection('shared_albums').findOne({ id });
  if (!album) throw new SharingApiError('Not found', 404, 'shared_album_not_found');
  const ownerId = ownerIdOf(album);
  let allowed = ownerId === user.id;
  if (!allowed) {
    const member = await db.collection('shared_album_members').findOne({ albumId: id, favoriteUserId: user.id });
    if (member && ownerId) allowed = await canViewOwnersResource(db, user.id, ownerId, 'shareAlbums');
  }
  if (!allowed) throw new SharingApiError('Forbidden', 403, 'shared_album_forbidden');

  const mediaLinks = await db.collection('shared_album_media').find({ albumId: id }).toArray();
  const mediaIds = [...new Set(mediaLinks.map((link) => link.mediaId).filter(Boolean))];
  const items = mediaIds.length
    ? await db.collection('media').find({ id: { $in: mediaIds }, userId: ownerId, trashed: { $ne: true } }).toArray()
    : [];
  const members = await db.collection('shared_album_members').find({ albumId: id }).toArray();
  const memberIds = [...new Set(members.map((member) => member.favoriteUserId).filter(Boolean))];
  const memberUsers = memberIds.length
    ? await db.collection('users').find({ id: { $in: memberIds } }).project({ _id: 0, id: 1, name: 1, avatarColor: 1 }).toArray()
    : [];
  return {
    album: clean({ ...album, ownerUserId: ownerId }),
    items: items.map(clean),
    members: memberUsers,
    isOwner: ownerId === user.id,
  };
}

export async function runSharedAlbumAction(user, albumId, requestedAction, body = {}) {
  const id = parseAlbumId(albumId);
  const action = parseAlbumAction(requestedAction);
  const input = parseAlbumActionInput(action, body);
  const db = await getDb();
  const album = await db.collection('shared_albums').findOne({ id });
  if (!album) throw new SharingApiError('Not found', 404, 'shared_album_not_found');
  const ownerId = ownerIdOf(album);
  if (ownerId !== user.id) throw new SharingApiError('Forbidden', 403, 'shared_album_forbidden');

  if (action === 'invite') {
    const link = await getFavoriteLink(db, user.id, input.favoriteUserId);
    if (!link) throw new SharingApiError('Not connected as favorites', 403, 'sharing_favorite_required');
    await db.collection('shared_album_members').updateOne(
      { albumId: id, favoriteUserId: input.favoriteUserId },
      { $setOnInsert: { id: uuidv4(), albumId: id, favoriteUserId: input.favoriteUserId, addedAt: new Date() } },
      { upsert: true },
    );
    await notify(db, {
      userId: input.favoriteUserId,
      type: 'album_shared',
      title: `${user.name} shared album "${album.name}" with you`,
      payload: { albumId: id, fromUserId: user.id, fromName: user.name },
    });
    return { ok: true };
  }

  if (action === 'remove-member') {
    await db.collection('shared_album_members').deleteOne({ albumId: id, favoriteUserId: input.favoriteUserId });
    return { ok: true };
  }

  if (action === 'add-media') {
    const owned = await db.collection('media').find({
      id: { $in: input.mediaIds },
      userId: user.id,
      trashed: { $ne: true },
    }).project({ _id: 0, id: 1 }).toArray();
    await Promise.all(owned.map((media) => db.collection('shared_album_media').updateOne(
      { albumId: id, mediaId: media.id },
      { $setOnInsert: { id: uuidv4(), albumId: id, mediaId: media.id, addedAt: new Date() } },
      { upsert: true },
    )));
    return { ok: true, added: owned.length };
  }

  if (action === 'remove-media') {
    await db.collection('shared_album_media').deleteMany({ albumId: id, mediaId: { $in: input.mediaIds } });
    return { ok: true };
  }

  await Promise.all([
    db.collection('shared_albums').deleteOne({ id }),
    db.collection('shared_album_members').deleteMany({ albumId: id }),
    db.collection('shared_album_media').deleteMany({ albumId: id }),
  ]);
  return { ok: true };
}

export async function shareMemory(user, body = {}) {
  const { title, mediaIds, recipientUserId } = parseShareMemoryInput(body);
  const db = await getDb();
  const link = await getFavoriteLink(db, user.id, recipientUserId);
  if (!link) throw new SharingApiError('Not connected as favorites', 403, 'sharing_favorite_required');
  const owned = await db.collection('media').find({
    id: { $in: mediaIds },
    userId: user.id,
    trashed: { $ne: true },
  }).project({ _id: 0, id: 1 }).toArray();
  if (!owned.length) throw new SharingApiError('No owned memories were available to share', 403, 'shared_memory_not_owned');

  const memory = {
    id: uuidv4(),
    ownerUserId: user.id,
    recipientUserId,
    title,
    mediaIds: owned.map((media) => media.id),
    sharedAt: new Date(),
  };
  await db.collection('shared_memories').insertOne(memory);
  await notify(db, {
    userId: recipientUserId,
    type: 'memory_shared',
    title: `${user.name} shared memory "${title}"`,
    payload: { memoryId: memory.id, fromUserId: user.id, fromName: user.name },
  });
  return { memory: clean(memory) };
}

export async function listSharedMemories(user) {
  const db = await getDb();
  const rows = await db.collection('shared_memories').find({
    $or: [{ recipientUserId: user.id }, { userId: user.id }],
  }).sort({ sharedAt: -1 }).toArray();
  const allowed = [];
  for (const row of rows) {
    const ownerId = ownerIdOf(row);
    if (!ownerId || recipientIdOf(row) !== user.id) continue;
    if (await canViewOwnersResource(db, user.id, ownerId, 'shareMemories')) {
      allowed.push({ ...row, ownerUserId: ownerId });
    }
  }

  const allIds = [...new Set(allowed.flatMap((row) => Array.isArray(row.mediaIds) ? row.mediaIds : []))];
  const media = allIds.length ? await db.collection('media').find({ id: { $in: allIds }, trashed: { $ne: true } }).toArray() : [];
  const mediaMap = Object.fromEntries(media.map((item) => [item.id, item]));
  const ownerIds = [...new Set(allowed.map((row) => row.ownerUserId))];
  const owners = ownerIds.length
    ? await db.collection('users').find({ id: { $in: ownerIds } }).project({ _id: 0, id: 1, name: 1, avatarColor: 1 }).toArray()
    : [];
  const ownerMap = Object.fromEntries(owners.map((owner) => [owner.id, owner]));
  const memories = allowed.map((row) => ({
    ...clean(row),
    mediaItems: (row.mediaIds || []).map((id) => mediaMap[id]).filter((item) => item?.userId === row.ownerUserId).map(clean),
    owner: ownerMap[row.ownerUserId],
  }));
  return { memories };
}

export async function reactToSharedMemory(user, memoryId, body = {}) {
  const id = String(memoryId || '').trim();
  if (!id) throw new SharingApiError('Not found', 404, 'shared_memory_not_found');
  const { emoji } = parseReactionInput(body);
  const db = await getDb();
  const memory = await db.collection('shared_memories').findOne({ id });
  if (!memory) throw new SharingApiError('Not found', 404, 'shared_memory_not_found');
  const ownerId = ownerIdOf(memory);
  const recipientId = recipientIdOf(memory);
  if (ownerId !== user.id && recipientId !== user.id) {
    throw new SharingApiError('Forbidden', 403, 'shared_memory_forbidden');
  }
  if (recipientId === user.id && ownerId !== user.id) {
    const canReact = await canViewOwnersResource(db, user.id, ownerId, 'shareMemories');
    if (!canReact) throw new SharingApiError('This shared memory is no longer available.', 403, 'shared_memory_access_revoked');
  }

  await db.collection('memory_reactions').insertOne({
    id: uuidv4(),
    sharedMemoryId: id,
    userId: user.id,
    emoji,
    createdAt: new Date(),
  });
  if (ownerId && ownerId !== user.id) {
    await notify(db, {
      userId: ownerId,
      type: 'memory_reaction',
      title: `${user.name} reacted ${emoji} to "${memory.title}"`,
      payload: { memoryId: id, emoji },
    });
  }
  return { ok: true };
}
