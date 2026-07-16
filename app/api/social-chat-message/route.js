import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

async function context(request) {
  const user = await getUserFromRequest(request);
  if (!user) return { error: json({ error: 'Please sign in again.' }, 401) };
  const db = await getDb();
  return { user, db };
}

export async function POST(request) {
  const ctx = await context(request);
  if (ctx.error) return ctx.error;
  const { user, db } = ctx;
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 20);
  const threadId = clean(body.threadId, 120);
  const messageId = clean(body.messageId, 120);

  const thread = await db.collection('chat_threads').findOne({
    id: threadId,
    memberIds: user.id,
    archivedFor: { $ne: user.id },
  });
  if (!thread) return json({ error: 'Conversation not found.' }, 404);

  const message = await db.collection('chat_messages').findOne({ id: messageId, threadId });
  if (!message) return json({ error: 'Message not found.' }, 404);
  if (message.senderId !== user.id) return json({ error: 'Only the sender can change this message.' }, 403);
  if (message.deletedAt) return json({ error: 'This message has already been deleted.' }, 400);

  const now = new Date();

  if (action === 'edit') {
    if (message.type === 'sticker' || message.memories?.length) {
      return json({ error: 'Sticker and memory attachments cannot be edited. Delete and resend instead.' }, 400);
    }
    const content = clean(body.content, 2000);
    if (!content) return json({ error: 'Write the updated message first.' }, 400);
    await db.collection('chat_messages').updateOne(
      { id: messageId, threadId, senderId: user.id, deletedAt: { $exists: false } },
      { $set: { content, editedAt: now, updatedAt: now } },
    );
    return json({ ok: true, messageId, content, editedAt: now });
  }

  if (action === 'delete') {
    await db.collection('chat_messages').updateOne(
      { id: messageId, threadId, senderId: user.id },
      {
        $set: {
          content: '',
          memories: [],
          memoryIds: [],
          sticker: null,
          stickerId: null,
          reactions: {},
          deletedAt: now,
          deletedBy: user.id,
          updatedAt: now,
        },
      },
    );
    return json({ ok: true, messageId, deletedAt: now });
  }

  return json({ error: 'Unsupported message action.' }, 400);
}
