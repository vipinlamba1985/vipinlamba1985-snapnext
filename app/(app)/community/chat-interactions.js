export async function sendReply(fetcher, { threadId, messageId, content }) {
  return fetcher('/social-chat-interactions', {
    method: 'POST',
    body: JSON.stringify({ action: 'reply', threadId, messageId, content }),
  });
}

export async function toggleReaction(fetcher, { threadId, messageId, emoji }) {
  return fetcher('/social-chat-interactions', {
    method: 'POST',
    body: JSON.stringify({ action: 'reaction', threadId, messageId, emoji }),
  });
}

async function appApiFetch(path, options) {
  const { apiFetch } = await import('@/lib/api-client');
  return apiFetch(path, options);
}

// UI convenience wrappers preserve the page API while the lower-level helpers stay
// dependency-injected for Node tests and other callers.
export async function replyToMessage(input) {
  return sendReply(appApiFetch, input);
}

export async function reactToMessage(input) {
  return toggleReaction(appApiFetch, input);
}
