import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }
function text(value, max = 2000) { return String(value || '').trim().slice(0, max); }
function publicUser(user) { return { id: user.id, name: user.name || user.displayName || user.email?.split('@')[0] || 'SnapNext user', email: user.email || '' }; }

async function context(request, routeContext) {
  const user = await getUserFromRequest(request);
  if (!user) return { error: json({ error: 'Please sign in again.' }, 401) };
  const db = await getDb();
  const action = (await routeContext.params).action || [];
  return { user, db, action };
}

async function memberThread(db, userId, threadId) {
  return db.collection('chat_threads').findOne({ id: threadId, memberIds: userId, archivedFor: { $ne: userId } });
}

export async function GET(request, routeContext) {
  const ctx = await context(request, routeContext); if (ctx.error) return ctx.error;
  const { user, db, action } = ctx;
  const [resource, id] = action;

  if (resource === 'threads' && !id) {
    const threads = await db.collection('chat_threads').find({ memberIds: user.id, archivedFor: { $ne: user.id } }).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(100).toArray();
    return json({ threads: threads.map(({ _id, ...thread }) => thread) });
  }

  if (resource === 'threads' && id) {
    const thread = await memberThread(db, user.id, id);
    if (!thread) return json({ error: 'Conversation not found.' }, 404);
    const messages = await db.collection('chat_messages').find({ threadId: id }).sort({ createdAt: 1 }).limit(300).toArray();
    return json({ thread: { ...thread, _id: undefined }, messages: messages.map(({ _id, ...message }) => message) });
  }

  return json({ error: 'Not found.' }, 404);
}

export async function POST(request, routeContext) {
  const ctx = await context(request, routeContext); if (ctx.error) return ctx.error;
  const { user, db, action } = ctx;
  const [resource, id, subresource] = action;
  const body = await request.json().catch(() => ({}));

  if (resource === 'threads' && !id) {
    const type = body.type === 'community' ? 'community' : 'direct';
    const email = text(body.email, 320).toLowerCase();
    const name = text(body.name, 80);
    let members = [publicUser(user)];

    if (type === 'direct') {
      if (!email || email === String(user.email || '').toLowerCase()) return json({ error: 'Enter another SnapNext member’s email.' }, 400);
      const target = await db.collection('users').findOne({ email: email });
      if (!target) return json({ error: 'No SnapNext account was found with that email.' }, 404);
      const memberIds = [user.id, target.id].sort();
      const existing = await db.collection('chat_threads').findOne({ type: 'direct', memberKey: memberIds.join(':') });
      if (existing) return json({ thread: { ...existing, _id: undefined }, existing: true });
      members.push(publicUser(target));
    } else if (!name) return json({ error: 'Give your community a name.' }, 400);

    const now = new Date();
    const thread = {
      id: uuidv4(), type, name: type === 'community' ? name : '', ownerId: user.id,
      members, memberIds: members.map(member => member.id), memberKey: type === 'direct' ? members.map(member => member.id).sort().join(':') : undefined,
      private: true, createdAt: now, updatedAt: now, lastMessageAt: now, lastMessage: '', archivedFor: [],
    };
    await db.collection('chat_threads').insertOne(thread);
    return json({ thread: { ...thread, _id: undefined } }, 201);
  }

  if (resource === 'threads' && id && subresource === 'messages') {
    const thread = await memberThread(db, user.id, id);
    if (!thread) return json({ error: 'Conversation not found.' }, 404);
    const content = text(body.content, 2000);
    if (!content) return json({ error: 'Write a message first.' }, 400);
    const recentCount = await db.collection('chat_messages').countDocuments({ threadId: id, senderId: user.id, createdAt: { $gt: new Date(Date.now() - 60_000) } });
    if (recentCount >= 20) return json({ error: 'You are sending messages too quickly. Please pause briefly.' }, 429);
    const message = { id: uuidv4(), threadId: id, senderId: user.id, sender: publicUser(user), content, createdAt: new Date(), editedAt: null };
    await db.collection('chat_messages').insertOne(message);
    await db.collection('chat_threads').updateOne({ id }, { $set: { lastMessage: content.slice(0, 160), lastMessageAt: message.createdAt, updatedAt: message.createdAt } });
    return json({ message: { ...message, _id: undefined } }, 201);
  }

  if (resource === 'threads' && id && subresource === 'members') {
    const thread = await memberThread(db, user.id, id);
    if (!thread || thread.type !== 'community') return json({ error: 'Community not found.' }, 404);
    if (thread.ownerId !== user.id) return json({ error: 'Only the community owner can invite members.' }, 403);
    const email = text(body.email, 320).toLowerCase();
    const target = await db.collection('users').findOne({ email });
    if (!target) return json({ error: 'No SnapNext account was found with that email.' }, 404);
    if (thread.memberIds.includes(target.id)) return json({ error: 'This person is already a member.' }, 400);
    const member = publicUser(target);
    await db.collection('chat_threads').updateOne({ id }, { $push: { members: member, memberIds: member.id }, $set: { updatedAt: new Date() } });
    return json({ ok: true, member });
  }

  return json({ error: 'Not found.' }, 404);
}
