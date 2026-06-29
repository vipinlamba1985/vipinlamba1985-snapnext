export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { isSuper } from '@/lib/plans';
import { getGovernanceState, updateAgentGovernance } from '@/lib/ai-agent-governance';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to view AI governance.' } }, { status: 401 });
  }
  if (!isSuper(user)) {
    return Response.json({ error: { code: 'feature_not_available', message: 'AI governance is available to Super User only.' } }, { status: 403 });
  }
  const db = await getDb();
  return Response.json(await getGovernanceState({ db }));
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to update AI governance.' } }, { status: 401 });
  }
  if (!isSuper(user)) {
    return Response.json({ error: { code: 'feature_not_available', message: 'AI governance is available to Super User only.' } }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  const result = await updateAgentGovernance({ db, user, body });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 400 });
  return Response.json(result);
}
