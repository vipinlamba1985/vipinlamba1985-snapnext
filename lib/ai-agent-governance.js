import { v4 as uuidv4 } from 'uuid';
import { getCertificationPlan } from '@/lib/ai-task-preview';

export const AI_AGENT_GOVERNANCE_VERSION = '6.0.0';

const ALLOWED_STATUS = ['training', 'shadow', 'assisted_review', 'certified', 'restricted', 'disabled'];

export async function getGovernanceState({ db }) {
  const certification = await getCertificationPlan({ db });
  const overrides = await db.collection('ai_agent_governance').find({}).toArray().catch(() => []);
  const overrideMap = Object.fromEntries(overrides.map((item) => [item.agentId, item]));

  return {
    ok: true,
    version: AI_AGENT_GOVERNANCE_VERSION,
    agents: certification.scorecards.map((card) => ({
      ...card,
      governance: overrideMap[card.agentId] || {
        agentId: card.agentId,
        status: card.recommendedStatus,
        locked: false,
        reason: 'default_certification_policy',
      },
    })),
  };
}

export async function updateAgentGovernance({ db, user, body = {} }) {
  const agentId = String(body.agentId || '').trim();
  const status = String(body.status || '').trim();
  if (!agentId) return { ok: false, status: 400, error: { code: 'invalid_agent', message: 'agentId is required.' } };
  if (!ALLOWED_STATUS.includes(status)) return { ok: false, status: 400, error: { code: 'invalid_status', message: `status must be one of: ${ALLOWED_STATUS.join(', ')}` } };

  const doc = {
    id: uuidv4(),
    agentId,
    status,
    locked: Boolean(body.locked),
    reason: String(body.reason || '').slice(0, 500) || 'manual_governance_update',
    updatedBy: user?.id || null,
    updatedAt: new Date(),
  };

  await db.collection('ai_agent_governance').updateOne(
    { agentId },
    { $set: doc, $push: { history: { status, reason: doc.reason, updatedBy: doc.updatedBy, updatedAt: doc.updatedAt } } },
    { upsert: true }
  );

  return { ok: true, governance: doc };
}
