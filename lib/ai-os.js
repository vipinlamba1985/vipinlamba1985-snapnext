import { v4 as uuidv4 } from 'uuid';
import { AI_FEATURES, AI_PLAN_LIMITS, getAiEntitlement, runAiTask } from '@/lib/ai-router';
import { isSuper } from '@/lib/plans';

export const SNAPNEXT_AI_CONSTITUTION = Object.freeze([
  'AI performance is the key to SnapNext success: accuracy, speed, reliability, cost efficiency, and user trust must be protected together.',
  'External AI remains the primary quality engine until SnapNext agents are certified through measurable Shadow Mode performance.',
  'Never delete, share, publish, or expose user data without explicit user approval and permission validation.',
  'Prefer the lowest-cost execution path that still meets the required quality threshold and protects user experience.',
  'Every expensive AI task must be estimated before execution and the user must receive clear options when credits are insufficient.',
  'Every AI action must be logged with feature, agent, provider path, credits, estimated cost, confidence, status, and safety outcome.',
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

const AGENT_DEFINITIONS = Object.freeze({
  upload: { id: 'upload', name: 'Upload Agent', feature: 'vision', safeAutonomy: false, status: 'shadow', confidence: 0.68 },
  memory: { id: 'memory', name: 'Memory Agent', feature: 'memorySummary', safeAutonomy: false, status: 'shadow', confidence: 0.7 },
  search: { id: 'search', name: 'Search Agent', feature: 'chat', safeAutonomy: false, status: 'training', confidence: 0.62 },
  creator: { id: 'creator', name: 'Creator Agent', feature: 'postIdeas', safeAutonomy: false, status: 'shadow', confidence: 0.72 },
  cleanup: { id: 'cleanup', name: 'Cleanup Agent', feature: 'chat', safeAutonomy: false, status: 'training', confidence: 0.58 },
});

const FEATURE_TO_AGENT = Object.freeze({
  caption: 'creator',
  hashtags: 'creator',
  emojis: 'creator',
  postIdeas: 'creator',
  doAll: 'creator',
  story: 'memory',
  memorySummary: 'memory',
  chat: 'search',
  vision: 'upload',
  videoScript: 'creator',
  audioTranscribe: 'upload',
});

const PLAN_REVENUE_ESTIMATE = Object.freeze({
  free: 0,
  plus: 9.99,
  pro: 19.99,
  family: 29.99,
  super_user: 0,
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

function planKey(user) {
  if (isSuper(user)) return 'super_user';
  return ['free', 'plus', 'pro', 'family'].includes(user?.plan) ? user.plan : 'free';
}

function structuredError(code, message, status = 400, extra = {}) {
  return { ok: false, status, error: { code, message, ...extra } };
}

export function getAgentForFeature(feature) {
  const agentId = FEATURE_TO_AGENT[feature] || 'search';
  return { ...AGENT_DEFINITIONS[agentId] };
}

export function classifyAiIntent({ feature, prompt = '', input = {} }) {
  const text = String(prompt || input?.topic || input?.text || input?.query || '').toLowerCase();
  const agent = getAgentForFeature(feature);
  const riskyActions = ['delete', 'remove forever', 'share with', 'publish', 'post to', 'send to', 'expose'];
  const expensiveSignals = ['4k', 'video', 'movie', 'thousands', 'all photos', 'cinematic', 'documentary', 'multilingual'];
  return {
    intentId: uuidv4(),
    agentId: agent.id,
    agentName: agent.name,
    feature,
    taskType: agent.id,
    requiresApproval: riskyActions.some((word) => text.includes(word)),
    likelyExpensive: expensiveSignals.some((word) => text.includes(word)),
    promptLength: text.length,
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
      { $match: { userId: user.id, day: dayKey(now) } },
      { $group: { _id: null, credits: { $sum: '$credits' } } },
    ]).toArray(),
    db.collection('ai_usage').aggregate([
      { $match: { userId: user.id, month: monthKey(now) } },
      { $group: { _id: null, credits: { $sum: '$credits' } } },
    ]).toArray(),
  ]);
  return { dailyUsed: daily[0]?.credits || 0, monthlyUsed: monthly[0]?.credits || 0 };
}

export async function estimateAiEconomy({ db, user, feature, qualityMode = QUALITY_MODES.BALANCED, prompt = '', input = {} }) {
  const plan = planKey(user);
  const limits = AI_PLAN_LIMITS[plan] || AI_PLAN_LIMITS.free;
  const featureDef = AI_FEATURES[feature];
  if (!featureDef) return structuredError('feature_not_available', 'This AI feature is not available.', 404);

  const entitlement = getAiEntitlement(user, feature, 1);
  if (!entitlement.ok) return entitlement;

  const intent = classifyAiIntent({ feature, prompt, input });
  const baseCredits = entitlement.credits;
  const modeMultiplier = QUALITY_MULTIPLIER[qualityMode] || 1;
  const complexityMultiplier = intent.likelyExpensive ? 2 : 1;
  const requiredCredits = Math.max(1, Math.ceil(baseCredits * modeMultiplier * complexityMultiplier));
  const usage = await currentUsage({ db, user });
  const monthlyRemaining = Math.max(0, limits.monthlyCredits - usage.monthlyUsed);
  const dailyRemaining = Math.max(0, limits.dailyCredits - usage.dailyUsed);
  const estimatedCostUsd = Number((requiredCredits * 0.00045).toFixed(6));
  const estimatedRevenue = PLAN_REVENUE_ESTIMATE[plan] || 0;
  const estimatedAiBudget = estimatedRevenue > 0 ? estimatedRevenue * 0.15 : 0.02;
  const profitGate = isSuper(user) || estimatedCostUsd <= Math.max(estimatedAiBudget, 0.02);
  const allowed = isSuper(user) || (monthlyRemaining >= requiredCredits && dailyRemaining >= requiredCredits && profitGate);

  return {
    ok: true,
    allowed,
    plan,
    feature,
    qualityMode,
    requiredCredits,
    estimatedCostUsd,
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

export function createShadowResult({ feature, prompt = '', input = {}, agent }) {
  const topic = input?.topic || input?.text || input?.query || prompt || 'SnapNext memory task';
  return {
    agentId: agent.id,
    agentName: agent.name,
    mode: AI_OS_MODES.SHADOW,
    confidence: agent.confidence,
    output: {
      summary: `${agent.name} observed a ${feature} task for: ${String(topic).slice(0, 120)}`,
      recommendedNextStep: 'Use external AI result for the user while this agent learns in Shadow Mode.',
    },
  };
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
    output: shadow.output,
    externalMeta,
    intent,
    status: 'observed',
    createdAt: new Date(),
  });
}

export async function runChiefAiTask({ db, user, feature, prompt = '', input = {}, media = null, request, qualityMode = QUALITY_MODES.BALANCED }) {
  const intent = classifyAiIntent({ feature, prompt, input });
  const agent = getAgentForFeature(feature);
  const guardian = guardianCheck({ user, feature, prompt, input, media, intent });
  if (!guardian.ok) {
    await logAiOsEvent({ db, user, event: { layer: 'guardian', status: 'blocked', feature, intent, error: guardian.error } });
    return guardian;
  }

  const economy = await estimateAiEconomy({ db, user, feature, qualityMode, prompt, input });
  if (!economy.ok) return economy;
  if (!economy.allowed) {
    await logAiOsEvent({ db, user, event: { layer: 'economy', status: 'requires_choice', feature, intent, economy } });
    return structuredError('ai_task_requires_choice', 'This AI task needs more credits or a lower-cost quality mode.', 402, {
      intent,
      economy,
    });
  }

  const shadow = createShadowResult({ feature, prompt, input, agent });
  const result = await runAiTask({ db, user, feature, prompt, input, media, request });
  if (!result.ok) {
    await logAiOsEvent({ db, user, event: { layer: 'chief_ai', status: 'failed', feature, intent, agent, error: result.error } });
    return result;
  }

  await logShadowResult({ db, user, shadow, externalMeta: result.meta, intent });
  await logAiOsEvent({ db, user, event: { layer: 'chief_ai', status: 'completed', feature, intent, agent, economy, meta: result.meta } });

  return {
    ...result,
    aiOs: {
      constitutionVersion: '1.0',
      chiefAi: 'active',
      guardian: 'passed',
      economy,
      assignedAgent: agent,
      shadowLearning: shadow,
      qualityMode,
    },
  };
}

export function getAiOsStatus() {
  return {
    ok: true,
    name: 'SnapNext Intelligence OS',
    version: '1.0',
    layers: ['Chief AI', 'Guardian AI', 'AI Economy Engine', 'AI Router', 'Agent Registry', 'Shadow Learning'],
    constitution: SNAPNEXT_AI_CONSTITUTION,
    agents: Object.values(AGENT_DEFINITIONS),
  };
}
