import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { canPost } from '@/lib/social-chat-policy';

export const runtime = 'nodejs';

const ALLOWED_REACTIONS = ['❤️', '😂', '😍', '👍', '🙏', '😮'];

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name || user.displayName || user.email?.split('@')[0] || 'SnapNext user',
  };
}

async function context(request) {
  const user = await getUserFromRequest(request);
  if (!user) return { error: json({ error: 'Please sign in again.' }, 401) };
  const db = await getDb();
  return { user, db };
}

async function memberThread(db, userId, threadId) {
  return db.collection('chat_threads').findOne({
    id: threadId,
    memberIds: userId,
    archivedFor: { $ne: userId },
  });
}

export async function POST(request) {
  const ctx = await context(request);
  if (ctx.error) return ctx.error;
  const { user, db } = ctx;
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 40);
  const threadId = clean(body.threadId, 120);
  const messageId = clean(body.messageId, 120);
  const thread = await memberThread(db, user.id, threadId);
  if (!thread) return json({ error: 'Conversation not found.' }, 404);

  if (action === 'reply') {
    if (!canPost(thread, user.id)) return json({ error: 'Posting is not available in this conversation.' }, 403);
    const parent = await db.collection('chat_messages').findOne({ id: messageId, threadId });
    if (!parent) return json({ error: 'The message you are replying to is unavailable.' }, 404);
    const content = clean(body.content, 2000);
    if (!content) return json({ error: 'Write a reply first.' }, 400);
    const now = new Date();
    const message = {
      id: uuidv4(),
      threadId,
      senderId: user.id,
      sender: publicUser(user),
      type: 'reply',
      content,
      memories: [],
      memoryIds: [],
      replyTo: {
        id: parent.id,
        senderId: parent.senderId,
        senderName: parent.sender?.name || 'Member',
        preview: clean(parent.content || (parent.sticker ? 'Memory Sticker' : parent.memories?.length ? 'Shared memory' : 'Message'), 160),
      },
      reactions: {},
      createdAt: now,
      editedAt: null,
    };
    await db.collection('chat_messages').insertOne(message);
    const inc = Object.fromEntries(thread.memberIds.filter(id => id !== user.id).map(id => [`unreadCounts.${id}`, 1]));
    await db.collection('chat_threads').updateOne(
      { id: threadId },
      {
        $set: {
          lastMessage: `Replied: ${content}`.slice(0, 160),
          lastMessageAt: now,
          updatedAt: now,
          [`lastReadAt.${user.id}`]: now,
          [`unreadCounts.${user.id}`]: 0,
        },
        ...(Object.keys(inc).length ? { $inc: inc } : {}),
      },
    );
    return json({ message: { ...message, _id: undefined } }, 201);
  }

  if (action === 'reaction') {
    const emoji = ALLOWED_REACTIONS.includes(body.emoji) ? body.emoji : '';
    if (!emoji) return json({ error: 'Choose a supported reaction.' }, 400);
    const message = await db.collection('chat_messages').findOne({ id: messageId, threadId });
    if (!message) return json({ error: 'Message not found.' }, 404);
    const reactions = { ...(message.reactions || {}) };
    const members = new Set(Array.isArray(reactions[emoji]) ? reactions[emoji] : []);
    if (members.has(user.id)) members.delete(user.id);
    else members.add(user.id);
    reactions[emoji] = [...members];
    if (!reactions[emoji].length) delete reactions[emoji];
    await db.collection('chat_messages').updateOne({ id: messageId, threadId }, { $set: { reactions, updatedAt: new Date() } });
    return json({ ok: true, messageId, reactions });
  }

  return json({ error: 'Unsupported chat action.' }, 400);
}
