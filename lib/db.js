import { MongoClient } from 'mongodb';

let client;
let db;

export async function getDb() {
  if (!client) {
    const url = process.env.MONGO_URL || process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;
    if (!url) {
      throw new Error('Database environment variable is missing in Vercel. Configure MONGODB_URI, then redeploy.');
    }
    client = new MongoClient(url, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
    try {
      await client.connect();
    } catch (err) {
      client = null;
      throw new Error(`Database connection failed: ${err.message}`);
    }
    const dbName = process.env.DB_NAME || process.env.MONGODB_DB || 'snapnext';
    db = client.db(dbName);
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
