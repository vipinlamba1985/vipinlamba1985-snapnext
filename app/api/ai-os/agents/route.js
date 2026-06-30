export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/auth';
import { isSuperUser } from '@/lib/entitlements';
import { getSpecialistAgentStatus, chooseSpecialistAgent, runSpecialistShadowPlan } from '@/lib/ai-specialist-agents';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to view SnapNext AI agents.' } }, { status: 401 });
  }

  const status = getSpecialistAgentStatus();
  return Response.json({
    ok: true,
    version: status.version,
    style: status.style,
    visibleMode: isSuperUser(user) ? 'admin' : 'user',
    agents: isSuperUser(user)
      ? status.agents
      : status.agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          status: agent.status,
          purpose: agent.purpose,
          learningMode: agent.learningMode,
        })),
  });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to test SnapNext AI agents.' } }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const task = typeof body.task === 'string' ? body.task.trim() : '';
  if (!task) {
    return Response.json({ error: { code: 'invalid_prompt', message: 'Task prompt is required.' } }, { status: 400 });
  }

  const agent = chooseSpecialistAgent({ feature: body.feature || 'chat', task, input: body.input || {} });
  const shadowPlan = runSpecialistShadowPlan({
    agent,
    feature: body.feature || 'chat',
    task,
    input: body.input || {},
    economy: body.economy || null,
    guardian: body.guardian || null,
  });

  return Response.json({
    ok: true,
    selectedAgent: agent,
    shadowPlan,
    note: 'This endpoint previews specialist-agent reasoning only. Production user-facing output still routes through Chief AI and external AI until certification.',
  });
}
