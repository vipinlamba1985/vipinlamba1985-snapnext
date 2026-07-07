import crypto from 'crypto';
import { isSuperUser } from '@/lib/entitlements';

export function isAiIndexEnabled() {
  return String(process.env.AI_INDEX_ENABLED || '').toLowerCase() === 'true';
}

export function hasAiWorkerSecret(request) {
  const expected = String(process.env.AI_WORKER_SECRET || '').trim();
  const received = String(request?.headers?.get?.('x-ai-worker-secret') || '').trim();
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function aiIndexAccess({ user, request, allowWorker = false }) {
  if (allowWorker && hasAiWorkerSecret(request)) {
    return { ok: true, worker: true, enabled: true, superUser: false };
  }
  if (!user) {
    return { ok: false, status: 401, error: { code: 'unauthenticated', message: 'Please sign in.' } };
  }

  const superUser = isSuperUser(user, request);
  const enabled = isAiIndexEnabled();
  if (!enabled && !superUser) {
    return {
      ok: false,
      status: 403,
      error: {
        code: 'ai_index_not_enabled',
        message: 'The Universal AI Index is still in controlled rollout.',
      },
    };
  }

  return { ok: true, worker: false, enabled, superUser };
}
