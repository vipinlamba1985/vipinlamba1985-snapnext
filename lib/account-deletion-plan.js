function uniqueIds(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function inIds(ids) {
  return { $in: uniqueIds(ids) };
}

export function buildAccountReferenceQueries(userId) {
  return {
    favorites: {
      $or: [
        { requesterUserId: userId },
        { targetUserId: userId },
        { userId },
        { otherId: userId },
      ],
    },
    ownedAlbums: {
      $or: [{ ownerUserId: userId }, { ownerId: userId }],
    },
    sharedMemories: {
      $or: [
        { ownerUserId: userId },
        { recipientUserId: userId },
        { ownerId: userId },
        { userId },
      ],
    },
  };
}

export function buildAccountDeletionFilters({
  userId,
  favoriteIds = [],
  ownedAlbumIds = [],
  sharedMemoryIds = [],
} = {}) {
  if (!userId) throw new Error('User id is required.');

  const favorites = uniqueIds(favoriteIds);
  const albums = uniqueIds(ownedAlbumIds);
  const memories = uniqueIds(sharedMemoryIds);

  return {
    media: { userId },
    sharedPhotos: {
      $or: [
        { ownerUserId: userId },
        { recipientUserId: userId },
        { userId },
        { ownerId: userId },
      ],
    },
    favorites: buildAccountReferenceQueries(userId).favorites,
    favoritePermissions: {
      $or: [
        { ownerUserId: userId },
        { favoriteUserId: userId },
        ...(favorites.length ? [{ favoriteId: inIds(favorites) }] : []),
      ],
    },
    sharedAlbums: buildAccountReferenceQueries(userId).ownedAlbums,
    sharedAlbumMembers: {
      $or: [
        { favoriteUserId: userId },
        ...(albums.length ? [{ albumId: inIds(albums) }] : []),
      ],
    },
    sharedAlbumMedia: albums.length ? { albumId: inIds(albums) } : { albumId: { $in: [] } },
    sharedMemories: buildAccountReferenceQueries(userId).sharedMemories,
    memoryReactions: {
      $or: [
        { userId },
        ...(memories.length ? [{ sharedMemoryId: inIds(memories) }] : []),
      ],
    },
    exportJobs: { userId },
    legacyExports: { userId },
    downloads: { userId },
    emailPrefs: { userId },
    emailEvents: { userId },
    notifications: { userId },
    billingStatus: { userId },
    subscriptions: { userId },
    billingEvents: { userId },
    smartSyncProfiles: { userId },
    smartSyncJobs: { userId },
    cloudConnections: { userId },
    cloudAssets: { userId },
    smartSyncNativeUploads: { userId },
    chatDevices: { userId },
    chatThreadKeys: {
      $or: [{ senderUserId: userId }, { recipientUserId: userId }],
    },
    chatMessages: { senderId: userId },
  };
}

export function extractReferenceIds(rows = []) {
  return uniqueIds(rows.map((row) => row?.id));
}
