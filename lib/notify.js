import { v4 as uuidv4 } from 'uuid';

/** Writes a single in-app notification row for one user. */
export async function notify(db, { userId, type, title, body = '', payload = {} }) {
  await db.collection('notifications').insertOne({
    id: uuidv4(), userId, type, title, body, payload, read: false, createdAt: new Date(),
  });
}
