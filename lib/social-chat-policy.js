export function permissionFor(thread, userId) {
  if (thread.ownerId === userId) return 'owner';
  return thread.memberPermissions?.[userId] || (thread.type === 'direct' ? 'post' : 'view');
}

export function canPost(thread, userId) {
  if (thread.type === 'direct') {
    return thread.status === 'active' && thread.memberIds?.includes(userId);
  }
  return ['owner', 'post'].includes(permissionFor(thread, userId));
}

export function canRead(thread, userId) {
  return Boolean(thread?.memberIds?.includes(userId) && !thread.archivedFor?.includes(userId));
}

export function directChatState(thread, userId) {
  if (thread.type !== 'direct') return null;
  return {
    pending: thread.status === 'pending',
    active: thread.status === 'active',
    declined: thread.status === 'declined',
    isSender: thread.requestSenderId === userId,
    isRecipient: thread.requestRecipientId === userId,
  };
}
