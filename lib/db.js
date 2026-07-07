import { MongoClient } from 'mongodb';

let client;
let db;

export async function getDb() {
  if (!client) {
    const url = process.env.MONGO_URL || process.env.MONGODB_URI;
    if (!url) {
      throw new Error('Database configuration error: MONGO_URL or MONGODB_URI environment variable is not defined.');
    }
    client = new MongoClient(url);
    try {
      await client.connect();
    } catch (err) {
      client = null;
      throw new Error(`Database connection failed: ${err.message}`);
    }
    db = client.db(process.env.DB_NAME || 'snapnext');
    // Ensure core, Universal AI Index, and AI Action Hands indexes. Keep this idempotent so old deployments upgrade safely.
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
      await db.collection('agent_actions').createIndex({ userId: 1, status: 1, createdAt: -1 });
      await db.collection('agent_actions').createIndex({ userId: 1, planId: 1, sequence: 1 });
      await db.collection('agent_tasks').createIndex({ userId: 1, status: 1, dueDate: 1 });
      await db.collection('agent_reminders').createIndex({ userId: 1, status: 1, remindAt: 1 });
      await db.collection('agent_collections').createIndex({ userId: 1, updatedAt: -1 });
      await db.collection('agent_drafts').createIndex({ userId: 1, status: 1, createdAt: -1 });
    } catch (e) {
      console.warn('Index creation warning:', e.message);
    }
  }
  return db;
}
