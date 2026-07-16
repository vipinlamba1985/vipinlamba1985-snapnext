import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }
function text(value, max = 2000) { return String(value || '').trim().slice(0, max); }
function publicUser(user) { return { id: user.id, name: user.name || user.displayName || user.email?.split('@')[0] || 'SnapNext user', email: user.email || '' }; }
function publicMemory(memory) {
  return {
    id: memory.id,
    name: memory.name || 'Shared memory',
    kind: memory.kind,
    mime: memory.mime,
    createdAt: memory.createdAt,
    favorite: Boolean(memory.favorite),
    caption: memory.aiAnalysis?.caption || memory.aiAnalysis?.description || '',
    album: memory.aiAnalysis?.autoAlbum || '',
  };
}

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

function permissionFor(thread, userId) {
  if (thread.ownerId === userId) return 'owner';
  return thread.memberPermissions?.[userId] || (thread.type === 'direct' ? 'post' : 'view');
}

function canPost(thread, userId) {
  if (thread.type === 'direct') return thread.status === 'active' && thread.memberIds?.includes(userId);
  return ['owner', 'post'].includes(permissionFor(thread, userId));
}

export async function GET(request, routeContext) {
  const ctx = await context(request, routeContext); if (ctx.error) return ctx.error;
  const { user, db, action } = ctx;
  const [resource, id] = action;

  if (resource === 'threads' && !id) {
    const threads = await db.collection('chat_threads').find({ memberIds: user.id, archivedFor: { $ne: user.id } }).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(100).toArray();
    return json({ threads: threads.map(({ _id, ...thread }) => ({ ...thread, currentUserPermission: permissionFor(thread, user.id), canPost: canPost(thread, user.id) })) });
  }

  if (resource === 'threads' && id) {
    const thread = await memberThread(db, user.id, id);
    if (!thread) return json({ error: 'Conversation not found.' }, 404);
    const messages = thread.type === 'direct' && thread.status !== 'active'
      ? []
      : await db.collection('chat_messages').find({ threadId: id }).sort({ createdAt: 1 }).limit(300).toArray();
    return json({
      thread: { ...thread, _id: undefined, currentUserPermission: permissionFor(thread, user.id), canPost: canPost(thread, user.id), isRequestRecipient: thread.requestRecipientId === user.id },
      messages: messages.map(({ _id, ...message }) => message),
    });
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
    let target = null;

    if (type === 'direct') {
      if (!email || email === String(user.email || '').toLowerCase()) return json({ error: 'Enter another SnapNext member’s email.' }, 400);
      target = await db.collection('users').findOne({ email });
      if (!target) return json({ error: 'No SnapNext account was found with that email.' }, 404);
      const memberIds = [user.id, target.id].sort();
      const existing = await db.collection('chat_threads').findOne({ type: 'direct', memberKey: memberIds.join(':') });
      if (existing) return json({ thread: { ...existing, _id: undefined }, existing: true });
      members.push(publicUser(target));
    } else if (!name) return json({ error: 'Give your community a name.' }, 400);

    const now = new Date();
    const memberPermissions = Object.fromEntries(members.map(member => [member.id, member.id === user.id ? 'owner' : type === 'direct' ? 'post' : 'view']));
    const thread = {
      id: uuidv4(), type, name: type === 'community' ? name : '', ownerId: user.id,
      members, memberIds: members.map(member => member.id), memberPermissions,
      memberKey: type === 'direct' ? members.map(member => member.id).sort().join(':') : undefined,
      status: type === 'direct' ? 'pending' : 'active',
      requestSenderId: type === 'direct' ? user.id : undefined,
      requestRecipientId: type === 'direct' ? target.id : undefined,
      private: true, purpose: type === 'community' ? 'memory_discussion' : 'private_chat',
      createdAt: now, updatedAt: now, lastMessageAt: now,
      lastMessage: type === 'direct' ? 'Chat request pending' : '', archivedFor: [],
    };
    await db.collection('chat_threads').insertOne(thread);
    return json({ thread: { ...thread, _id: undefined } }, 201);
  }

  if (resource === 'threads' && id && subresource === 'respond') {
    const thread = await memberThread(db, user.id, id);
    if (!thread || thread.type !== 'direct' || thread.status !== 'pending') return json({ error: 'Chat request not found.' }, 404);
    if (thread.requestRecipientId !== user.id) return json({ error: 'Only the invited person can respond.' }, 403);
    const decision = body.decision === 'accept' ? 'accept' : body.decision === 'decline' ? 'decline' : '';
    if (!decision) return json({ error: 'Choose accept or decline.' }, 400);
    const now = new Date();
    if (decision === 'decline') {
      await db.collection('chat_threads').updateOne({ id }, { $set: { status: 'declined', lastMessage: 'Chat request declined', updatedAt: now, lastMessageAt: now } });
      return json({ ok: true, status: 'declined' });
    }
    await db.collection('chat_threads').updateOne({ id }, { $set: { status: 'active', acceptedAt: now, acceptedBy: user.id, lastMessage: 'Chat request accepted', updatedAt: now, lastMessageAt: now } });
    return json({ ok: true, status: 'active' });
  }

  if (resource === 'threads' && id && subresource === 'messages') {
    const thread = await memberThread(db, user.id, id);
    if (!thread) return json({ error: 'Conversation not found.' }, 404);
    if (!canPost(thread, user.id)) {
      if (thread.type === 'direct' && thread.status !== 'active') return json({ error: 'This private chat must be accepted before messages or memories can be shared.' }, 403);
      return json({ error: 'You can view this community, but the owner has not given you posting permission.' }, 403);
    }
    const content = text(body.content, 2000);
    const memoryIds = [...new Set(Array.isArray(body.memoryIds) ? body.memoryIds.map(String) : [])].slice(0, 10);
    if (!content && !memoryIds.length) return json({ error: 'Write a message or share a memory first.' }, 400);
    const recentCount = await db.collection('chat_messages').countDocuments({ threadId: id, senderId: user.id, createdAt: { $gt: new Date(Date.now() - 60_000) } });
    if (recentCount >= 20) return json({ error: 'You are sending messages too quickly. Please pause briefly.' }, 429);

    let memories = [];
    if (memoryIds.length) {
      const found = await db.collection('media').find({ id: { $in: memoryIds }, userId: user.id, trashed: { $ne: true }, kind: { $in: ['photo', 'video'] } }).toArray();
      const byId = new Map(found.map(memory => [memory.id, memory]));
      if (found.length !== memoryIds.length) return json({ error: 'One or more memories could not be shared.' }, 400);
      memories = memoryIds.map(memoryId => publicMemory(byId.get(memoryId)));
    }

    const message = {
      id: uuidv4(), threadId: id, senderId: user.id, sender: publicUser(user), content,
      memories, memoryIds: memories.map(memory => memory.id), createdAt: new Date(), editedAt: null,
    };
    await db.collection('chat_messages').insertOne(message);
    const preview = content || (memories.length === 1 ? 'Shared a memory' : `Shared ${memories.length} memories`);
    await db.collection('chat_threads').updateOne({ id }, { $set: { lastMessage: preview.slice(0, 160), lastMessageAt: message.createdAt, updatedAt: message.createdAt } });
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
    const permission = body.permission === 'post' ? 'post' : 'view';
    const member = publicUser(target);
    await db.collection('chat_threads').updateOne({ id }, {
      $push: { members: member, memberIds: member.id },
      $set: { [`memberPermissions.${member.id}`]: permission, updatedAt: new Date() },
    });
    return json({ ok: true, member, permission });
  }

  if (resource === 'threads' && id && subresource === 'permissions') {
    const thread = await memberThread(db, user.id, id);
    if (!thread || thread.type !== 'community') return json({ error: 'Community not found.' }, 404);
    if (thread.ownerId !== user.id) return json({ error: 'Only the community owner can change posting permissions.' }, 403);
    const memberId = text(body.memberId, 120);
    if (!memberId || memberId === thread.ownerId || !thread.memberIds.includes(memberId)) return json({ error: 'Choose a valid community member.' }, 400);
    const permission = body.permission === 'post' ? 'post' : 'view';
    await db.collection('chat_threads').updateOne({ id }, { $set: { [`memberPermissions.${memberId}`]: permission, updatedAt: new Date() } });
    return json({ ok: true, memberId, permission });
  }

  return json({ error: 'Not found.' }, 404);
}