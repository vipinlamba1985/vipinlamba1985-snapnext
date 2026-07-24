import { deleteStoredMediaStrict } from '@/lib/storage-strict-delete';
import { resetAiIndexForUser } from '@/lib/universal-ai-index';
import {
  buildAccountDeletionFilters,
  buildAccountReferenceQueries,
  extractReferenceIds,
} from './account-deletion-plan.js';

const USER_SCOPED_AI_COLLECTIONS = [
  'ai_usage',
  'ai_history',
  'ai_os_events',
  'ai_shadow_results',
  'ai_supervisor_events',
  'ai_generations',
];

function count(result) {
  return result?.deletedCount || 0;
}

async function collectDeletionReferences(db, userId) {
  const queries = buildAccountReferenceQueries(userId);
  const [favorites, ownedAlbums, sharedMemories] = await Promise.all([
    db.collection('favorites').find(queries.favorites).project({ id: 1, _id: 0 }).toArray(),
    db.collection('shared_albums').find(queries.ownedAlbums).project({ id: 1, _id: 0 }).toArray(),
    db.collection('shared_memories').find(queries.sharedMemories).project({ id: 1, _id: 0 }).toArray(),
  ]);
  return {
    favoriteIds: extractReferenceIds(favorites),
    ownedAlbumIds: extractReferenceIds(ownedAlbums),
    sharedMemoryIds: extractReferenceIds(sharedMemories),
  };
}

export async function deleteUserAccountData({ db, userId }) {
  if (!db) throw new Error('Database is required.');
  if (!userId) throw new Error('User id is required.');

  const aiIndex = await resetAiIndexForUser({ db, userId });
  const references = await collectDeletionReferences(db, userId);
  const filters = buildAccountDeletionFilters({ userId, ...references });

  // Fail closed for storage cleanup. Database rows are not removed until every
  // owned media object has been deleted successfully, so a retry can recover.
  const mediaDocs = await db.collection('media').find(filters.media).toArray();
  const storageFailures = [];
  for (const doc of mediaDocs) {
    try {
      await deleteStoredMediaStrict({ provider: doc.provider || 'local', storageKey: doc.storageKey });
    } catch (error) {
      storageFailures.push({ mediaId: doc.id, message: error?.message || 'storage_delete_failed' });
      console.error('[delete-account] failed to delete storage file', doc.storageKey, error?.message);
    }
  }

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
    sharedAlbumMedia,
    sharedAlbumMembers,
    sharedAlbums,
    sharedMemories,
    memoryReactions,
    memoryRelationships,
    memoryEvents,
    memoryStories,
    memoryGraphSnapshots,
    lifeProfiles,
    lifeEvents,
    lifeEventDrafts,
    creativeProjects,
    exportJobs,
    legacyExports,
    downloads,
    emailPrefs,
    emailEvents,
    notifications,
    billingStatus,
    subscriptions,
    billingEvents,
    smartSyncProfiles,
    smartSyncJobs,
    cloudConnections,
    cloudAssets,
    smartSyncNativeUploads,
    chatDevices,
    chatThreadKeys,
    chatMessages,
    ...aiCollections
  ] = await Promise.all([
    db.collection('media').deleteMany(filters.media),
    db.collection('shared_photos').deleteMany(filters.sharedPhotos),
    db.collection('favorites').deleteMany(filters.favorites),
    db.collection('favorite_permissions').deleteMany(filters.favoritePermissions),
    db.collection('shared_album_media').deleteMany(filters.sharedAlbumMedia),
    db.collection('shared_album_members').deleteMany(filters.sharedAlbumMembers),
    db.collection('shared_albums').deleteMany(filters.sharedAlbums),
    db.collection('shared_memories').deleteMany(filters.sharedMemories),
    db.collection('memory_reactions').deleteMany(filters.memoryReactions),
    db.collection('memory_relationships').deleteMany(filters.memoryRelationships),
    db.collection('memory_events').deleteMany(filters.memoryEvents),
    db.collection('memory_stories').deleteMany(filters.memoryStories),
    db.collection('memory_graph_snapshots').deleteMany(filters.memoryGraphSnapshots),
    db.collection('life_profiles').deleteMany(filters.lifeProfiles),
    db.collection('life_events').deleteMany(filters.lifeEvents),
    db.collection('life_event_drafts').deleteMany(filters.lifeEventDrafts),
    db.collection('creative_projects').deleteMany(filters.creativeProjects),
    db.collection('export_jobs').deleteMany(filters.exportJobs),
    db.collection('exports').deleteMany(filters.legacyExports),
    db.collection('downloads').deleteMany(filters.downloads),
    db.collection('email_prefs').deleteMany(filters.emailPrefs),
    db.collection('email_events').deleteMany(filters.emailEvents),
    db.collection('notifications').deleteMany(filters.notifications),
    db.collection('billing_status').deleteMany(filters.billingStatus),
    db.collection('subscriptions').deleteMany(filters.subscriptions),
    db.collection('billing_events').deleteMany(filters.billingEvents),
    db.collection('smart_sync_profiles').deleteMany(filters.smartSyncProfiles),
    db.collection('smart_sync_jobs').deleteMany(filters.smartSyncJobs),
    db.collection('cloud_connections').deleteMany(filters.cloudConnections),
    db.collection('cloud_assets').deleteMany(filters.cloudAssets),
    db.collection('smart_sync_native_uploads').deleteMany(filters.smartSyncNativeUploads),
    db.collection('chat_e2ee_devices').deleteMany(filters.chatDevices),
    db.collection('chat_e2ee_thread_keys').deleteMany(filters.chatThreadKeys),
    db.collection('chat_messages').deleteMany(filters.chatMessages),
    ...USER_SCOPED_AI_COLLECTIONS.map((name) => db.collection(name).deleteMany({ userId })),
  ]);

  // Remove the deleted account from conversation membership without deleting
  // other members' messages or threads.
  const chatThreads = await db.collection('chat_threads').updateMany(
    { memberIds: userId },
    {
      $pull: { memberIds: userId },
      $unset: {
        [`unreadCounts.${userId}`]: '',
        [`lastReadAt.${userId}`]: '',
      },
      $set: { updatedAt: new Date() },
    },
  );

  return {
    aiIndex,
    storageFailures,
    references,
    deleted: {
      media: count(media),
      sharedPhotos: count(sharedPhotos),
      favorites: count(favorites),
      favoritePermissions: count(favoritePermissions),
      sharedAlbumMedia: count(sharedAlbumMedia),
      sharedAlbumMembers: count(sharedAlbumMembers),
      sharedAlbums: count(sharedAlbums),
      sharedMemories: count(sharedMemories),
      memoryReactions: count(memoryReactions),
      memoryRelationships: count(memoryRelationships),
      memoryEvents: count(memoryEvents),
      memoryStories: count(memoryStories),
      memoryGraphSnapshots: count(memoryGraphSnapshots),
      lifeProfiles: count(lifeProfiles),
      lifeEvents: count(lifeEvents),
      lifeEventDrafts: count(lifeEventDrafts),
      creativeProjects: count(creativeProjects),
      exportJobs: count(exportJobs),
      legacyExports: count(legacyExports),
      downloads: count(downloads),
      emailPrefs: count(emailPrefs),
      emailEvents: count(emailEvents),
      notifications: count(notifications),
      billingStatus: count(billingStatus),
      subscriptions: count(subscriptions),
      billingEvents: count(billingEvents),
      smartSyncProfiles: count(smartSyncProfiles),
      smartSyncJobs: count(smartSyncJobs),
      cloudConnections: count(cloudConnections),
      cloudAssets: count(cloudAssets),
      smartSyncNativeUploads: count(smartSyncNativeUploads),
      chatDevices: count(chatDevices),
      chatThreadKeys: count(chatThreadKeys),
      chatMessages: count(chatMessages),
      chatThreadsUpdated: chatThreads?.modifiedCount || 0,
      aiCollections: Object.fromEntries(
        USER_SCOPED_AI_COLLECTIONS.map((name, index) => [name, aiCollections[index]?.deletedCount || 0]),
      ),
    },
  };
}
