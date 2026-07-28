import { apiFetch } from '@/lib/api-client';

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

// Community page uses these convenience wrappers. Keep the lower-level helpers above
// injectable for tests while exposing the page-level API expected by the UI.
export async function replyToMessage(input) {
  return sendReply(apiFetch, input);
}

export async function reactToMessage(input) {
  return toggleReaction(apiFetch, input);
}
