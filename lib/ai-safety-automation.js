import { getAiAlerts } from '@/lib/ai-task-preview';
import { getGovernanceState, updateAgentGovernance } from '@/lib/ai-agent-governance';

export const AI_SAFETY_AUTOMATION_VERSION = '8.0.0';

export async function getRollbackRecommendations({ db }) {
  const [alerts, governance] = await Promise.all([
    getAiAlerts({ db }),
    getGovernanceState({ db }),
  ]);

  const recommendations = [];
  governance.agents.forEach((agent) => {
    const readiness = Number(agent.readinessScore || 0);
    const current = agent.governance?.status || agent.currentStatus;
    if (current === 'certified' && readiness < 0.75) {
      recommendations.push({
        agentId: agent.agentId,
        agentName: agent.agentName,
        currentStatus: current,
        recommendedStatus: 'assisted_review',
        reason: 'Certified agent readiness dropped below 75%. Move back to assisted review.',
      });
    }
    if (readiness < 0.15 && !['disabled', 'restricted'].includes(current)) {
      recommendations.push({
        agentId: agent.agentId,
        agentName: agent.agentName,
        currentStatus: current,
        recommendedStatus: 'restricted',
        reason: 'Agent readiness is very low. Restrict autonomy until more learning data is collected.',
      });
    }
  });

  return {
    ok: true,
    version: AI_SAFETY_AUTOMATION_VERSION,
    alerts: alerts.alerts || [],
    recommendations,
    autoApplied: false,
    policy: 'Recommendations only by default. Super User approval is required before changing governance.',
  };
}

export async function applyRollbackRecommendation({ db, user, body = {} }) {
  const agentId = String(body.agentId || '').trim();
  const recommendedStatus = String(body.recommendedStatus || '').trim();
  if (!agentId || !recommendedStatus) {
    return { ok: false, status: 400, error: { code: 'invalid_recommendation', message: 'agentId and recommendedStatus are required.' } };
  }
  return updateAgentGovernance({
    db,
    user,
    body: {
      agentId,
      status: recommendedStatus,
      locked: Boolean(body.locked),
      reason: body.reason || 'applied_ai_safety_rollback_recommendation',
    },
  });
}

export function buildCreditUpgradeGuidance({ preview }) {
  const economy = preview?.economy || preview?.preview?.economy;
  if (!economy) return null;
  const required = economy.requiredCredits || 0;
  const remaining = Math.min(economy.monthlyCreditsRemaining ?? required, economy.dailyCreditsRemaining ?? required);
  if (economy.allowed && required <= 5) return null;
  return {
    title: 'This is a premium AI task',
    message: economy.allowed
      ? 'You have enough credits, but this task is compute-heavy. Review quality options before starting.'
      : 'You need more AI credits or a lower-cost quality mode to continue.',
    requiredCredits: required,
    availableCredits: Math.max(0, remaining),
    options: [
      { label: 'Use Economy Mode', action: 'quality_economy', description: 'Lower cost with simpler output.' },
      { label: 'Use Balanced Mode', action: 'quality_balanced', description: 'Best default balance of quality and cost.' },
      { label: 'Upgrade / Buy Credits', action: 'billing', description: 'Unlock larger AI tasks and premium generation.' },
      { label: 'Save for Later', action: 'defer', description: 'Keep the idea and run it when credits renew.' },
    ],
  };
}
