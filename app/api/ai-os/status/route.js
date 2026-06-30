export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/auth';
import { getAiOsStatus } from '@/lib/ai-os';
import { isSuperUser } from '@/lib/entitlements';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to view SnapNext AI OS status.' } }, { status: 401 });
  }

  const status = getAiOsStatus();
  return Response.json({
    ...status,
    visibleMode: isSuperUser(user) ? 'admin' : 'user',
    agents: isSuperUser(user)
      ? status.agents
      : status.agents.map((agent) => ({ id: agent.id, name: agent.name, status: agent.status })),
  });
}
