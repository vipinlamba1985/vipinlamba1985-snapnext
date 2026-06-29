import { v4 as uuidv4 } from 'uuid';
import { getSpecialistAgentStatus } from '@/lib/ai-specialist-agents';

export const AI_LEARNING_ENGINE_VERSION = '3.0.0';

const CERTIFICATION_THRESHOLDS = Object.freeze({
  minimumTasks: 1000,
  minimumUserApprovalRate: 0.9,
  maximumFallbackFailureRate: 0.05,
  minimumConfidence: 0.92,
});

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(value) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function scoreAgent({ shadow = {}, feedback = {}, usage = {}, baseAgent }) {
  const tasks = safeNumber(shadow.tasks, 0);
  const feedbackCount = safeNumber(feedback.total, 0);
  const positive = safeNumber(feedback.positive, 0);
  const negative = safeNumber(feedback.negative, 0);
  const failures = safeNumber(usage.failures, 0);
  const totalUsage = safeNumber(usage.total, 0);
  const userApprovalRate = feedbackCount > 0 ? positive / feedbackCount : 0;
  const fallbackFailureRate = totalUsage > 0 ? failures / totalUsage : 0;
  const observedConfidence = safeNumber(shadow.avgConfidence, baseAgent?.confidence || 0.55);
  const readinessScore = pct((Math.min(tasks, CERTIFICATION_THRESHOLDS.minimumTasks) / CERTIFICATION_THRESHOLDS.minimumTasks) * 0.25
    + userApprovalRate * 0.35
    + Math.max(0, 1 - fallbackFailureRate) * 0.2
    + observedConfidence * 0.2);

  const certificationReady = tasks >= CERTIFICATION_THRESHOLDS.minimumTasks
    && userApprovalRate >= CERTIFICATION_THRESHOLDS.minimumUserApprovalRate
    && fallbackFailureRate <= CERTIFICATION_THRESHOLDS.maximumFallbackFailureRate
    && observedConfidence >= CERTIFICATION_THRESHOLDS.minimumConfidence;

  return {
    tasks,
    feedbackCount,
    positive,
    negative,
    userApprovalRate: pct(userApprovalRate),
    fallbackFailureRate: pct(fallbackFailureRate),
    observedConfidence: pct(observedConfidence),
    readinessScore,
    certificationReady,
    recommendedStatus: certificationReady ? 'assisted_review' : baseAgent?.status || 'shadow',
  };
}

export async function recordAiFeedback({ db, user, body = {} }) {
  if (!db || !user) return { ok: false, error: { code: 'missing_context', message: 'Missing database or user context.' }, status: 500 };
  const agentId = String(body.agentId || '').trim();
  const requestId = String(body.requestId || '').trim();
  const rating = String(body.rating || '').trim();
  const allowedRatings = ['accepted', 'rejected', 'edited', 'saved', 'shared'];
  if (!agentId) return { ok: false, status: 400, error: { code: 'invalid_agent', message: 'agentId is required.' } };
  if (!allowedRatings.includes(rating)) return { ok: false, status: 400, error: { code: 'invalid_rating', message: 'rating must be accepted, rejected, edited, saved, or shared.' } };

  const doc = {
    id: uuidv4(),
    userId: user.id,
    agentId,
    requestId: requestId || null,
    rating,
    positive: ['accepted', 'saved', 'shared'].includes(rating),
    edited: rating === 'edited',
    comment: String(body.comment || '').slice(0, 1000),
    feature: body.feature || null,
    createdAt: new Date(),
  };
  await db.collection('ai_agent_feedback').insertOne(doc);
  return { ok: true, feedback: doc };
}

export async function getAgentScorecards({ db }) {
  const base = getSpecialistAgentStatus().agents;
  if (!db) {
    return { ok: true, version: AI_LEARNING_ENGINE_VERSION, thresholds: CERTIFICATION_THRESHOLDS, scorecards: base.map((agent) => ({ agent, scores: scoreAgent({ baseAgent: agent }) })) };
  }

  const [shadowRows, feedbackRows, usageRows] = await Promise.all([
    db.collection('ai_shadow_results').aggregate([
      { $group: { _id: '$agentId', tasks: { $sum: 1 }, avgConfidence: { $avg: '$confidence' } } },
    ]).toArray().catch(() => []),
    db.collection('ai_agent_feedback').aggregate([
      { $group: { _id: '$agentId', total: { $sum: 1 }, positive: { $sum: { $cond: ['$positive', 1, 0] } }, negative: { $sum: { $cond: ['$positive', 0, 1] } } } },
    ]).toArray().catch(() => []),
    db.collection('ai_usage').aggregate([
      { $group: { _id: '$feature', total: { $sum: 1 }, failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } } } },
    ]).toArray().catch(() => []),
  ]);

  const shadowMap = Object.fromEntries(shadowRows.map((row) => [row._id, row]));
  const feedbackMap = Object.fromEntries(feedbackRows.map((row) => [row._id, row]));
  const usageMap = Object.fromEntries(usageRows.map((row) => [row._id, row]));

  return {
    ok: true,
    version: AI_LEARNING_ENGINE_VERSION,
    thresholds: CERTIFICATION_THRESHOLDS,
    scorecards: base.map((agent) => ({
      agent,
      scores: scoreAgent({
        shadow: shadowMap[agent.id],
        feedback: feedbackMap[agent.id],
        usage: usageMap[agent.selectedFeature] || usageMap[agent.feature],
        baseAgent: agent,
      }),
    })),
  };
}

export async function getBusinessIntelligenceSnapshot({ db }) {
  if (!db) return { ok: true, version: AI_LEARNING_ENGINE_VERSION, summary: {}, rows: [] };
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db.collection('ai_usage').aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: { plan: '$plan', provider: '$provider', feature: '$feature', status: '$status' }, requests: { $sum: 1 }, credits: { $sum: '$credits' }, cost: { $sum: '$estimatedCost' }, avgMs: { $avg: '$durationMs' } } },
    { $sort: { requests: -1 } },
  ]).toArray().catch(() => []);

  const summary = rows.reduce((acc, row) => {
    acc.requests += row.requests || 0;
    acc.credits += row.credits || 0;
    acc.estimatedAiCost += row.cost || 0;
    if (row._id?.status === 'failed') acc.failures += row.requests || 0;
    return acc;
  }, { requests: 0, credits: 0, estimatedAiCost: 0, failures: 0 });
  summary.estimatedAiCost = Number(summary.estimatedAiCost.toFixed(6));
  summary.failureRate = summary.requests ? pct(summary.failures / summary.requests) : 0;

  const mostExpensiveFeature = rows.slice().sort((a, b) => (b.cost || 0) - (a.cost || 0))[0]?._id?.feature || null;
  const mostUsedFeature = rows[0]?._id?.feature || null;

  return {
    ok: true,
    version: AI_LEARNING_ENGINE_VERSION,
    windowDays: 30,
    summary: { ...summary, mostExpensiveFeature, mostUsedFeature },
    rows,
    recommendation: mostExpensiveFeature
      ? `Review ${mostExpensiveFeature} for cost optimization without reducing user quality.`
      : 'No AI usage data yet. Keep external AI quality primary while gathering usage signals.',
  };
}
