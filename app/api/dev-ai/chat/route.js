import { getUserFromRequest } from '@/lib/auth';
import { isSuperUser } from '@/lib/entitlements';
import { runDevAI } from '@/lib/dev-ai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user || !isSuperUser(user, request)) {
    return Response.json({ error: { code: 'forbidden', message: 'SnapNext Dev AI is admin-only.' } }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const message = String(body.message || '').trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message) {
    return Response.json({ error: { code: 'invalid_request', message: 'Enter a coding question or task.' } }, { status: 400 });
  }
  if (message.length > 20000) {
    return Response.json({ error: { code: 'too_large', message: 'The request is too large.' } }, { status: 413 });
  }

  try {
    const result = await runDevAI({ message, history });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error('[dev-ai] request failed', error?.message);
    return Response.json({ error: { code: 'dev_ai_failed', message: error?.message || 'Dev AI could not complete this request.' } }, { status: 500 });
  }
}
