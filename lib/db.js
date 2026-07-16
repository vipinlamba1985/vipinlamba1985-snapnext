import { MongoClient } from 'mongodb';

let client;
let db;
let connectionPromise;

async function connectDatabase() {
  const url = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!url) {
    throw new Error('Database configuration error: MONGO_URL or MONGODB_URI environment variable is not defined.');
  }

  const nextClient = new MongoClient(url);

  try {
    await nextClient.connect();
    const nextDb = nextClient.db(process.env.DB_NAME || 'snapnext');

    // Publish the initialized handles only after the connection succeeds.
    // This prevents concurrent requests from observing a client before db exists.
    client = nextClient;
    db = nextDb;

    // Ensure core and Universal AI Index indexes. Keep this idempotent so old deployments upgrade safely.
    try {
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('media').createIndex({ userId: 1, createdAt: -1 });
      await db.collection('media').createIndex({ userId: 1, hash: 1 });
      await db.collection('analysis_jobs').createIndex({ status: 1, priority: -1, createdAt: 1 });
      await db.collection('analysis_jobs').createIndex({ userId: 1, mediaId: 1, pipelineVersion: 1, status: 1 });
      await db.collection('asset_intelligence').createIndex({ userId: 1, mediaId: 1, pipelineVersion: 1 }, { unique: true });
      await db.collection('asset_intelligence').createIndex({ userId: 1, updatedAt: -1 });
      await db.collection('ai_feedback_events').createIndex({ userId: 1, createdAt: -1 });
      await db.collection('ai_feedback_events').createIndex({ userId: 1, mediaId: 1, eventType: 1, createdAt: -1 });
      await db.collection('chat_e2ee_devices').createIndex({ userId: 1, deviceId: 1 }, { unique: true });
      await db.collection('chat_e2ee_devices').createIndex({ userId: 1, revokedAt: 1, lastSeenAt: -1 });
      await db.collection('chat_e2ee_thread_keys').createIndex(
        { threadId: 1, recipientUserId: 1, recipientDeviceId: 1, keyVersion: 1 },
        { unique: true },
      );
      await db.collection('chat_e2ee_thread_keys').createIndex({ threadId: 1, keyVersion: 1, revokedAt: 1 });
      await db.collection('chat_messages').createIndex({ threadId: 1, encryption: 1, createdAt: -1 });
    } catch (error) {
      console.warn('Index creation warning:', error.message);
    }

    return db;
  } catch (error) {
    try {
      await nextClient.close();
    } catch {}

    client = undefined;
    db = undefined;
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

export async function getDb() {
  if (db) return db;

  if (!connectionPromise) {
    connectionPromise = connectDatabase().finally(() => {
      connectionPromise = undefined;
    });
  }

  return connectionPromise;
}
