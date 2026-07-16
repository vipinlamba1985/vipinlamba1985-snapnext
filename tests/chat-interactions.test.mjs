import test from 'node:test';
import assert from 'node:assert/strict';

import { sendReply, toggleReaction } from '../app/(app)/community/chat-interactions.js';

test('sendReply posts the expected authenticated API payload', async () => {
  let request;
  const apiFetch = async (path, options) => { request = { path, options }; return { ok: true }; };
  await sendReply(apiFetch, { threadId: 't1', messageId: 'm1', content: 'Hello' });
  assert.equal(request.path, '/social-chat-interactions');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { action: 'reply', threadId: 't1', messageId: 'm1', content: 'Hello' });
});

test('toggleReaction posts the selected emoji and message identity', async () => {
  let request;
  const apiFetch = async (path, options) => { request = { path, options }; return { ok: true }; };
  await toggleReaction(apiFetch, { threadId: 't1', messageId: 'm1', emoji: '❤️' });
  assert.deepEqual(JSON.parse(request.options.body), { action: 'reaction', threadId: 't1', messageId: 'm1', emoji: '❤️' });
});
