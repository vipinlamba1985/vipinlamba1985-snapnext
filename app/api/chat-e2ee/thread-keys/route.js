import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

async function memberThread(db, userId, threadId) {
  return db.collection('chat_threads').findOne({ id: threadId, memberIds: userId });
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const url = new URL(request.url);
  const threadId = clean(url.searchParams.get('threadId'));
  const deviceId = clean(url.searchParams.get('deviceId'));
  const db = await getDb();
  if (!await memberThread(db, user.id, threadId)) return json({ error: 'Conversation not found.' }, 404);
  const envelope = await db.collection('chat_e2ee_thread_keys').findOne(
    { threadId, recipientUserId: user.id, recipientDeviceId: deviceId, revokedAt: null },
    { projection: { _id: 0 } },
  );
  return json({ envelope: envelope || null });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const body = await request.json().catch(() => ({}));
  const threadId = clean(body.threadId);
  const db = await getDb();
  const thread = await memberThread(db, user.id, threadId);
  if (!thread) return json({ error: 'Conversation not found.' }, 404);

  const recipientUserId = clean(body.recipientUserId);
  const recipientDeviceId = clean(body.recipientDeviceId);
  const senderDeviceId = clean(body.senderDeviceId);
  const wrappedKey = body.wrappedKey;
  if (!thread.memberIds.includes(recipientUserId)) return json({ error: 'Recipient is not a conversation member.' }, 400);
  if (!wrappedKey?.ciphertext || !wrappedKey?.iv || !wrappedKey?.keyVersion) return json({ error: 'Wrapped key envelope is incomplete.' }, 400);

  const device = await db.collection('chat_e2ee_devices').findOne({
    userId: recipientUserId,
    deviceId: recipientDeviceId,
    revokedAt: null,
  });
  if (!device) return json({ error: 'Recipient device is unavailable.' }, 404);

  const now = new Date();
  await db.collection('chat_e2ee_thread_keys').updateOne(
    { threadId, recipientUserId, recipientDeviceId, keyVersion: Number(wrappedKey.keyVersion) },
    {
      $set: {
        threadId,
        recipientUserId,
        recipientDeviceId,
        senderUserId: user.id,
        senderDeviceId,
        keyVersion: Number(wrappedKey.keyVersion),
        algorithm: wrappedKey.algorithm || 'ECDH-P256+A256GCM',
        iv: String(wrappedKey.iv),
        ciphertext: String(wrappedKey.ciphertext),
        revokedAt: null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return json({ stored: true }, 201);
}
