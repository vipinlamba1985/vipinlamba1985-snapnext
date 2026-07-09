export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { aiIndexAccess } from '@/lib/ai-index-access';
import { listAgentActions, planAgentActions } from '@/lib/agent-action-engine';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  const access = aiIndexAccess({ user, request });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || undefined;
  const limit = Number(url.searchParams.get('limit') || 50);
  const db = await getDb();
  const actions = await listAgentActions({ db, userId: user.id, status, limit });
  return Response.json({ ok: true, actions });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  const access = aiIndexAccess({ user, request });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = await request.json().catch(() => ({}));
  const task = String(body.task || body.request || '').trim();
  if (!task) return Response.json({ error: { code: 'task_required', message: 'Tell SnapNext what you want done.' } }, { status: 400 });

  const db = await getDb();
  const plan = await planAgentActions({ db, user, requestText: task });
  return Response.json({ ok: true, ...plan });
}
