import { v4 as uuidv4 } from 'uuid';
import { getEffectivePlan } from '@/lib/entitlements';

const COST_CEILINGS = Object.freeze({
  free: 0.02,
  plus: 0.75,
  pro: 1.75,
  family: 2.5,
  super_user: 999,
});

function dayKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function monthKey(date = new Date()) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; }

export function classifyExecutionPath({ prompt = '', media = null, deterministic = false, feature = '' }) {
  const text = String(prompt || '').toLowerCase();
  if (deterministic) return 'deterministic_no_model';
  if (media?.imageBase64 || feature === 'vision' || feature === 'audioTranscribe') return 'vision_or_media_ai';
  if (/\b(caption|hashtag|emoji|draft|post idea|story|summary|write|create)\b/.test(text)) return 'generative_ai';
  return 'grounded_text_ai';
}

export function estimateTaskCost({ provider = 'unknown', credits = 0, prompt = '', media = null }) {
  const base = provider === 'gemini' ? 0.00008 : provider === 'openai' ? 0.00045 : 0.00025;
  const tokenFactor = Math.ceil(String(prompt || '').length / 2000) || 1;
  const mediaFactor = media?.imageBase64 ? 3 : 1;
  return Number((base * Math.max(1, credits || 1) * tokenFactor * mediaFactor).toFixed(6));
}

export function supervisorDecision({ user, feature, prompt = '', media = null, qualityMode = 'balanced', request }) {
  const plan = getEffectivePlan(user, request);
  const path = classifyExecutionPath({ prompt, media, feature });
  const promptChars = String(prompt || '').length;
  const ceiling = COST_CEILINGS[plan] ?? COST_CEILINGS.free;
  return {
    id: uuidv4(),
    plan,
    feature,
    path,
    qualityMode,
    promptChars,
    maxPromptChars: 5500,
    monthlyCostCeiling: ceiling,
    allowModel: path !== 'deterministic_no_model' && promptChars <= 5500,
    reason: promptChars > 5500 ? 'prompt_context_too_large' : 'approved',
  };
}

export async function recordSupervisorEvent({ db, user, requestId, feature, intent, agent, decision, provider = null, credits = 0, estimatedCost = 0, latencyMs = 0, status, errorCode = null, fallbackUsed = false, matchedMediaCount = 0 }) {
  if (!db) return;
  try {
    await db.collection('ai_supervisor_events').insertOne({
      id: uuidv4(),
      requestId: requestId || uuidv4(),
      userId: user?.id || null,
      plan: decision?.plan || null,
      feature,
      taskType: intent?.taskType || null,
      agentId: agent?.id || intent?.agentId || null,
      agentName: agent?.name || intent?.agentName || null,
      executionPath: decision?.path || null,
      provider,
      qualityMode: decision?.qualityMode || null,
      promptChars: decision?.promptChars || 0,
      credits,
      estimatedCost,
      latencyMs,
      status,
      errorCode,
      fallbackUsed,
      matchedMediaCount,
      day: dayKey(),
      month: monthKey(),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('[ai-supervisor] failed to record event', error?.message);
  }
}

export async function getSupervisorSummary({ db, days = 30 }) {
  const since = new Date(Date.now() - Math.max(1, Number(days) || 30) * 24 * 60 * 60 * 1000);
  const [byPath, byPlan, failures, recent] = await Promise.all([
    db.collection('ai_supervisor_events').aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { executionPath: '$executionPath', provider: '$provider', status: '$status' }, requests: { $sum: 1 }, credits: { $sum: '$credits' }, cost: { $sum: '$estimatedCost' }, avgMs: { $avg: '$latencyMs' } } },
      { $sort: { requests: -1 } },
    ]).toArray(),
    db.collection('ai_supervisor_events').aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { plan: '$plan', feature: '$feature' }, requests: { $sum: 1 }, cost: { $sum: '$estimatedCost' }, credits: { $sum: '$credits' } } },
      { $sort: { requests: -1 } },
    ]).toArray(),
    db.collection('ai_supervisor_events').aggregate([
      { $match: { createdAt: { $gte: since }, status: { $ne: 'completed' } } },
      { $group: { _id: { errorCode: '$errorCode', feature: '$feature' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray(),
    db.collection('ai_supervisor_events').find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(50).toArray(),
  ]);
  return { ok: true, windowDays: days, byPath, byPlan, failures, recent };
}
