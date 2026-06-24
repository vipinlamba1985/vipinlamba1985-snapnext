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
    // ensure indexes
    try {
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('media').createIndex({ userId: 1, createdAt: -1 });
      await db.collection('media').createIndex({ userId: 1, hash: 1 });
    } catch (e) {
      console.warn('Index creation warning:', e.message);
    }
  }
  return db;
}
