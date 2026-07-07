import { storage } from '@/lib/storage';
import { resetAiIndexForUser } from '@/lib/universal-ai-index';

const USER_SCOPED_AI_COLLECTIONS = [
  'ai_usage',
  'ai_history',
  'ai_os_events',
  'ai_shadow_results',
  'ai_supervisor_events',
  'ai_generations',
];

export async function deleteUserAccountData({ db, userId }) {
  if (!db) throw new Error('Database is required.');
  if (!userId) throw new Error('User id is required.');

  // Derived AI data is removed first. If this fails, deletion stops before
  // original media or account records are touched.
  const aiIndex = await resetAiIndexForUser({ db, userId });

  const mediaDocs = await db.collection('media').find({ userId }).toArray();
  const storageFailures = [];
  for (const doc of mediaDocs) {
    try {
      await storage.delete({ provider: doc.provider || 'local', storageKey: doc.storageKey });
    } catch (error) {
      storageFailures.push({ mediaId: doc.id, message: error?.message || 'storage_delete_failed' });
      console.error('[delete-account] failed to delete storage file', doc.storageKey, error?.message);
    }
  }

  // Fail closed: keep database records and the user account if any original
  // file could not be removed. A later retry can safely repeat deletions.
  if (storageFailures.length) {
    const error = new Error('Some media files could not be removed. Please retry account deletion.');
    error.code = 'storage_cleanup_failed';
    error.failureCount = storageFailures.length;
    throw error;
  }

  const [
    media,
    sharedPhotos,
    favorites,
    favoritePermissions,
    sharedAlbums,
    sharedAlbumMembers,
    sharedMemories,
    exportsResult,
    emailPrefs,
    notifications,
    billingStatus,
    ...aiCollections
  ] = await Promise.all([
    db.collection('media').deleteMany({ userId }),
    db.collection('shared_photos').deleteMany({ $or: [{ userId }, { ownerId: userId }] }),
    db.collection('favorites').deleteMany({ $or: [{ userId }, { otherId: userId }] }),
    db.collection('favorite_permissions').deleteMany({ $or: [{ ownerUserId: userId }, { favoriteUserId: userId }] }),
    db.collection('shared_albums').deleteMany({ ownerId: userId }),
    db.collection('shared_album_members').deleteMany({ favoriteUserId: userId }),
    db.collection('shared_memories').deleteMany({ ownerId: userId }),
    db.collection('exports').deleteMany({ userId }),
    db.collection('email_prefs').deleteMany({ userId }),
    db.collection('notifications').deleteMany({ userId }),
    db.collection('billing_status').deleteMany({ userId }),
    ...USER_SCOPED_AI_COLLECTIONS.map((name) => db.collection(name).deleteMany({ userId })),
  ]);

  return {
    aiIndex,
    deleted: {
      media: media.deletedCount || 0,
      sharedPhotos: sharedPhotos.deletedCount || 0,
      favorites: favorites.deletedCount || 0,
      favoritePermissions: favoritePermissions.deletedCount || 0,
      sharedAlbums: sharedAlbums.deletedCount || 0,
      sharedAlbumMembers: sharedAlbumMembers.deletedCount || 0,
      sharedMemories: sharedMemories.deletedCount || 0,
      exports: exportsResult.deletedCount || 0,
      emailPrefs: emailPrefs.deletedCount || 0,
      notifications: notifications.deletedCount || 0,
      billingStatus: billingStatus.deletedCount || 0,
      aiCollections: Object.fromEntries(USER_SCOPED_AI_COLLECTIONS.map((name, index) => [name, aiCollections[index]?.deletedCount || 0])),
    },
  };
}
