import { v4 as uuidv4 } from 'uuid';
import { AI_FEATURES, AI_PLAN_LIMITS, getAiEntitlement, runAiTask } from '@/lib/ai-router';
import { getEffectivePlan, applyAiCreditSimulation, isSuperUser } from '@/lib/entitlements';
import { getPlan } from '@/lib/plans';
import { aiTaskCostCeiling } from '@/lib/ai/registry';
import { chooseSpecialistAgent, getSpecialistAgentStatus, runSpecialistShadowPlan } from '@/lib/ai-specialist-agents';

export const SNAPNEXT_AI_CONSTITUTION = Object.freeze([
  'AI performance is the key to SnapNext success: accuracy, speed, reliability, cost efficiency, and user trust must be protected together.',
  'External AI remains the primary quality engine until SnapNext workflows are validated through measurable production performance.',
  'Never delete, share, publish, purchase, or expose user data without explicit user approval and permission validation.',
  'Prefer deterministic or cached results, then the lowest-cost external path that still meets the required quality threshold.',
  'Every expensive AI task must be estimated before execution and the user must receive clear options when credits are insufficient.',
  'Every AI action must be logged with task, provider, model, credits, settled cost, confidence, status, and safety outcome.',
]);

export const AI_OS_MODES = Object.freeze({
  SHADOW: 'shadow',
  ASSISTED: 'assisted',
  CERTIFIED: 'certified',
});

export const QUALITY_MODES = Object.freeze({
  ECONOMY: 'economy',
  BALANCED: 'balanced',
  PREMIUM: 'premium',
  ULTRA: 'ultra',
});

const QUALITY_MULTIPLIER = Object.freeze({
  economy: 0.65,
  balanced: 1,
  premium: 1.6,
  ultra: 2.5,
});

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function planKey(user, request) {
  return getEffectivePlan(user, request);
}

function structuredError(code, message, status = 400, extra = {}) {
  return { ok: false, status, error: { code, message, ...extra } };
}

export function getAgentForFeature(feature, prompt = '', input = {}) {
  return chooseSpecialistAgent({ feature, task: prompt, input });
}

export function classifyAiIntent({ feature, prompt = '', input = {} }) {
  const text = String(prompt || input?.topic || input?.text || input?.query || '').toLowerCase();
  const agent = getAgentForFeature(feature, prompt, input);
  const riskyActions = ['delete', 'remove forever', 'share with', 'publish', 'post to', 'send to', 'purchase', 'buy', 'expose'];
  const expensiveSignals = ['4k', 'video', 'movie', 'thousands', 'all photos', 'cinematic', 'documentary', 'multilingual'];
  return {
    intentId: uuidv4(),
    agentId: agent.id,
    agentName: agent.name,
    feature: agent.selectedFeature || feature,
    requestedFeature: feature,
    taskType: agent.id,
    requiresApproval: riskyActions.some((word) => text.includes(word)),
    likelyExpensive: expensiveSignals.some((word) => text.includes(word)),
    promptLength: text.length,
    confidence: agent.confidence,
    selectionReason: agent.selectionReason,
  };
}

export function guardianCheck({ user, feature, prompt = '', input = {}, media = null, intent }) {
  if (!user) return structuredError('unauthenticated', 'Please sign in to use SnapNext AI.', 401);
  const text = String(prompt || input?.topic || input?.text || '').toLowerCase();
  const blocked = [
    { match: 'ignore previous instructions', code: 'prompt_injection_detected' },
    { match: 'bypass permission', code: 'permission_bypass_detected' },
    { match: 'show another user', code: 'privacy_violation_detected' },
    { match: 'leak private', code: 'privacy_violation_detected' },
    { match: 'reveal secret', code: 'privacy_violation_detected' },
  ].find((rule) => text.includes(rule.match));
  if (blocked) {
    return structuredError(blocked.code, 'SnapNext Guardian blocked this request to protect privacy and safety.', 403, { intent });
  }
  if (intent?.requiresApproval) {
    return structuredError('approval_required', 'This AI task requires explicit user approval before SnapNext can continue.', 409, { intent });
  }
  if (media?.containsFaceIdentityRequest) {
    return structuredError('face_identity_blocked', 'SnapNext can group user-approved people, but it cannot identify a person without permission.', 403, { intent });
  }
  return { ok: true, safetyScore: 1, trustGate: 'passed' };
}

async function currentUsage({ db, user }) {
  if (!db || !user?.id) return { dailyUsed: 0, monthlyUsed: 0 };
  const now = new Date();
  const [daily, monthly] = await Promise.all([
    db.collection('ai_usage').aggregate([
      { $match: { userId: user.id, day: dayKey(now), status: 'success' } },
      { $group: { _id: null, credits: { $sum: '$credits' } } },
    ]).toArray(),
    db.collection('ai_usage').aggregate([
      { $match: { userId: user.id, month: monthKey(now), status: 'success' } },
      { $group: { _id: null, credits: { $sum: '$credits' } } },
    ]).toArray(),
  ]);
  return { dailyUsed: daily[0]?.credits || 0, monthlyUsed: monthly[0]?.credits || 0 };
}

export async function estimateAiEconomy({ db, user, feature, qualityMode = QUALITY_MODES.BALANCED, prompt = '', input = {}, request }) {
  const plan = planKey(user, request);
  const limits = applyAiCreditSimulation(AI_PLAN_LIMITS[plan] || AI_PLAN_LIMITS.free, request);
  const featureDef = AI_FEATURES[feature];
  if (!featureDef) return structuredError('feature_not_available', 'This AI feature is not available.', 404);

  const entitlement = getAiEntitlement(user, feature, 1, request);
  if (!entitlement.ok) return entitlement;

  const intent = classifyAiIntent({ feature, prompt, input });
  const baseCredits = entitlement.credits;
  const modeMultiplier = QUALITY_MULTIPLIER[qualityMode] || 1;
  const complexityMultiplier = intent.likelyExpensive ? 2 : 1;
  const requiredCredits = Math.max(1, Math.ceil(baseCredits * modeMultiplier * complexityMultiplier));
  const usage = await currentUsage({ db, user });
  const monthlyRemaining = Math.max(0, limits.monthlyCredits - usage.monthlyUsed);
  const dailyRemaining = Math.max(0, limits.dailyCredits - usage.dailyUsed);
  const taskCostCeiling = Math.max(0.000001, aiTaskCostCeiling(feature) || 0.001);
  const estimatedCostUsd = Number((taskCostCeiling * modeMultiplier * complexityMultiplier).toFixed(6));
  const currentPlan = getPlan(plan);
  const weeklyAiBudget = Math.max(0, Number(currentPlan.weeklyExternalAiUsd) || 0);
  const profitGate = plan === 'super_user' || estimatedCostUsd <= weeklyAiBudget;
  const allowed = plan === 'super_user' || (monthlyRemaining >= requiredCredits && dailyRemaining >= requiredCredits && profitGate);

  return {
    ok: true,
    allowed,
    plan,
    feature,
    qualityMode,
    requiredCredits,
    estimatedCostUsd,
    weeklyAiBudgetUsd: weeklyAiBudget,
    monthlyCreditsRemaining: monthlyRemaining,
    dailyCreditsRemaining: dailyRemaining,
    profitGate,
    reason: allowed ? 'approved' : 'credits_or_profit_gate_requires_user_choice',
    userOptions: buildCreditOptions(baseCredits, complexityMultiplier, monthlyRemaining),
  };
}

function buildCreditOptions(baseCredits, complexityMultiplier, remaining) {
  return [
    { label: 'Premium Quality', qualityMode: QUALITY_MODES.PREMIUM, credits: Math.max(1, Math.ceil(baseCredits * 1.6 * complexityMultiplier)), quality: 'Best quality for premium results' },
    { label: 'Balanced Quality', qualityMode: QUALITY_MODES.BALANCED, credits: Math.max(1, Math.ceil(baseCredits * complexityMultiplier)), quality: 'Recommended balance of quality and cost' },
    { label: 'Economy Quality', qualityMode: QUALITY_MODES.ECONOMY, credits: Math.max(1, Math.ceil(baseCredits * 0.65 * complexityMultiplier)), quality: 'Lower cost, simpler output' },
    { label: 'Save for later', qualityMode: 'defer', credits: 0, quality: remaining <= 0 ? 'Wait until credits renew or buy credits later' : 'Keep task as draft' },
  ];
}

export function createShadowResult({ feature, prompt = '', input = {}, agent, economy = null, guardian = null }) {
  return runSpecialistShadowPlan({ agent, feature, task: prompt, input, economy, guardian });
}

async function logAiOsEvent({ db, user, event }) {
  if (!db) return;
  await db.collection('ai_os_events').insertOne({
    id: uuidv4(),
    userId: user?.id || null,
    ...event,
    createdAt: new Date(),
  });
}

async function logShadowResult({ db, user, shadow, externalMeta, intent }) {
  if (!db) return;
  await db.collection('ai_shadow_results').insertOne({
    id: uuidv4(),
    userId: user?.id || null,
    agentId: shadow.agentId,
    agentName: shadow.agentName,
    feature: intent.feature,
    confidence: shadow.confidence,
    output: shadow,
    externalMeta,
    intent,
    status: 'observed',
    createdAt: new Date(),
  });
}

export async function runChiefAiTask({ db, user, feature, prompt = '', input = {}, media = null, request, qualityMode = QUALITY_MODES.BALANCED }) {
  const intent = classifyAiIntent({ feature, prompt, input });
  const agent = getAgentForFeature(feature, prompt, input);
  const guardian = guardianCheck({ user, feature, prompt, input, media, intent });
  if (!guardian.ok) {
    await logAiOsEvent({ db, user, event: { layer: 'guardian', status: 'blocked', feature, intent, error: guardian.error } });
    return guardian;
  }

  const economy = await estimateAiEconomy({ db, user, feature, qualityMode, prompt, input, request });
  if (!economy.ok) return economy;
  if (!economy.allowed) {
    const previewShadow = createShadowResult({ feature, prompt, input, agent, economy, guardian });
    await logAiOsEvent({ db, user, event: { layer: 'economy', status: 'requires_choice', feature, intent, economy, shadow: previewShadow } });
    return structuredError('ai_task_requires_choice', 'This AI task needs more credits or a lower-cost quality mode.', 402, {
      intent,
      economy,
      shadowLearning: previewShadow,
    });
  }

  const shadow = createShadowResult({ feature, prompt, input, agent, economy, guardian });
  const result = await runAiTask({ db, user, feature, prompt, input, media, request });
  if (!result.ok) {
    await logAiOsEvent({ db, user, event: { layer: 'chief_ai', status: 'failed', feature, intent, agent, error: result.error, shadow } });
    return result;
  }

  await logShadowResult({ db, user, shadow, externalMeta: result.meta, intent });
  await logAiOsEvent({ db, user, event: { layer: 'chief_ai', status: 'completed', feature, intent, agent, economy, meta: result.meta } });

  return {
    ...result,
    aiOs: {
      constitutionVersion: '2.0',
      chiefAi: 'gateway_orchestrated',
      premiumAssistantMode: 'single-assistant-with-specialist-workflows',
      guardian: 'passed',
      economy,
      assignedWorkflow: agent,
      shadowLearning: shadow,
      qualityMode,
    },
  };
}

export function getAiOsStatus() {
  const specialistStatus = getSpecialistAgentStatus();
  return {
    ok: true,
    name: 'SnapNext Intelligence OS',
    version: '3.0-p0',
    layers: ['AI Task Registry', 'AI Execution Gateway', 'Privacy and Approval Middleware', 'AI Wallet', 'Company Profit Guard', 'Provider Adapters', 'Workflow Telemetry'],
    constitution: SNAPNEXT_AI_CONSTITUTION,
    agents: specialistStatus.agents,
    style: specialistStatus.style,
  };
}
