export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/auth';
import { getAiOsStatus } from '@/lib/ai-os';
import { isSuper } from '@/lib/plans';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to view SnapNext AI OS status.' } }, { status: 401 });
  }

  const status = getAiOsStatus();
  return Response.json({
    ...status,
    visibleMode: isSuper(user) ? 'admin' : 'user',
    agents: isSuper(user)
      ? status.agents
      : status.agents.map((agent) => ({ id: agent.id, name: agent.name, status: agent.status })),
  });
}
