export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { aiIndexAccess } from '@/lib/ai-index-access';
import { approveAndExecuteAgentAction, cancelAgentAction } from '@/lib/agent-action-engine';

export async function POST(request, { params }) {
  const user = await getUserFromRequest(request);
  const access = aiIndexAccess({ user, request });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const actionId = String((await params)?.actionId || '').trim();
  const body = await request.json().catch(() => ({}));
  const decision = String(body.decision || '').toLowerCase();
  if (!actionId || !['approve', 'cancel'].includes(decision)) {
    return Response.json({ error: { code: 'invalid_decision', message: 'Choose approve or cancel.' } }, { status: 400 });
  }

  const db = await getDb();
  try {
    const action = decision === 'approve'
      ? await approveAndExecuteAgentAction({ db, userId: user.id, actionId })
      : await cancelAgentAction({ db, userId: user.id, actionId });
    return Response.json({ ok: true, action });
  } catch (error) {
    return Response.json({ error: { code: 'action_failed', message: error?.message || 'Action could not be completed.' } }, { status: 409 });
  }
}
