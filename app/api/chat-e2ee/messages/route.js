import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { canPost } from '@/lib/social-chat-policy';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function validEnvelope(envelope) {
  return Boolean(
    envelope
    && envelope.version === 1
    && envelope.algorithm === 'A256GCM'
    && Number.isInteger(Number(envelope.keyVersion))
    && clean(envelope.senderDeviceId, 120)
    && typeof envelope.iv === 'string'
    && envelope.iv.length <= 64
    && typeof envelope.ciphertext === 'string'
    && envelope.ciphertext.length > 0
    && envelope.ciphertext.length <= 120000,
  );
}

async function context(request) {
  const user = await getUserFromRequest(request);
  if (!user) return { error: json({ error: 'Please sign in again.' }, 401) };
  const db = await getDb();
  return { user, db };
}

export async function GET(request) {
  const ctx = await context(request);
  if (ctx.error) return ctx.error;
  const url = new URL(request.url);
  const threadId = clean(url.searchParams.get('threadId'));
  const before = url.searchParams.get('before');
  const thread = await ctx.db.collection('chat_threads').findOne({ id: threadId, memberIds: ctx.user.id });
  if (!thread) return json({ error: 'Conversation not found.' }, 404);
  const query = { threadId, encryption: 'e2ee-v1' };
  if (before) query.createdAt = { $lt: new Date(before) };
  const messages = await ctx.db.collection('chat_messages')
    .find(query)
    .project({ _id: 0, content: 0, memories: 0, sticker: 0 })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  return json({ messages: messages.reverse() });
}

export async function POST(request) {
  const ctx = await context(request);
  if (ctx.error) return ctx.error;
  const body = await request.json().catch(() => ({}));
  const threadId = clean(body.threadId);
  const thread = await ctx.db.collection('chat_threads').findOne({ id: threadId, memberIds: ctx.user.id });
  if (!thread) return json({ error: 'Conversation not found.' }, 404);
  if (!canPost(thread, ctx.user.id)) return json({ error: 'Posting is not available in this conversation.' }, 403);
  if (!validEnvelope(body.envelope)) return json({ error: 'Encrypted message envelope is invalid.' }, 400);

  const senderDeviceId = clean(body.envelope.senderDeviceId, 120);
  const device = await ctx.db.collection('chat_e2ee_devices').findOne({
    userId: ctx.user.id,
    deviceId: senderDeviceId,
    revokedAt: null,
  });
  if (!device) return json({ error: 'This device is not registered for encrypted chat.' }, 403);

  const keyVersion = Number(body.envelope.keyVersion);
  const memberKeyCount = await ctx.db.collection('chat_e2ee_thread_keys').countDocuments({
    threadId,
    keyVersion,
    recipientUserId: { $in: thread.memberIds },
    revokedAt: null,
  });
  if (memberKeyCount < thread.memberIds.length) {
    return json({ error: 'Conversation keys are not ready for every member.' }, 409);
  }

  const now = new Date();
  const message = {
    id: uuidv4(),
    threadId,
    senderId: ctx.user.id,
    sender: {
      id: ctx.user.id,
      name: ctx.user.name || ctx.user.displayName || ctx.user.email?.split('@')[0] || 'SnapNext user',
    },
    encryption: 'e2ee-v1',
    envelope: {
      version: 1,
      algorithm: 'A256GCM',
      keyVersion,
      senderDeviceId,
      iv: body.envelope.iv,
      ciphertext: body.envelope.ciphertext,
    },
    createdAt: now,
    editedAt: null,
    deletedAt: null,
  };
  await ctx.db.collection('chat_messages').insertOne(message);

  const increments = Object.fromEntries(
    thread.memberIds.filter(id => id !== ctx.user.id).map(id => [`unreadCounts.${id}`, 1]),
  );
  await ctx.db.collection('chat_threads').updateOne(
    { id: threadId },
    {
      $set: {
        encryptionMode: 'e2ee-v1',
        lastMessage: 'Encrypted message',
        lastMessageAt: now,
        updatedAt: now,
        [`lastReadAt.${ctx.user.id}`]: now,
        [`unreadCounts.${ctx.user.id}`]: 0,
      },
      ...(Object.keys(increments).length ? { $inc: increments } : {}),
    },
  );
  return json({ message: { ...message, _id: undefined } }, 201);
}
