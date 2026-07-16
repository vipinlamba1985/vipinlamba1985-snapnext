export async function sendReply(apiFetch, { threadId, messageId, content }) {
  return apiFetch('/social-chat-interactions', {
    method: 'POST',
    body: JSON.stringify({ action: 'reply', threadId, messageId, content }),
  });
}

export async function toggleReaction(apiFetch, { threadId, messageId, emoji }) {
  return apiFetch('/social-chat-interactions', {
    method: 'POST',
    body: JSON.stringify({ action: 'reaction', threadId, messageId, emoji }),
  });
}
