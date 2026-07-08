import * as raw from './ai-router.js';
import { externalAiBlockedError, releaseExternalAiSpend, reserveExternalAiSpend, settleExternalAiSpend } from '@/lib/ai-spend-gate';
import { getUserAiWalletSnapshot } from '@/lib/ai-weekly-wallet';

export const AI_FEATURES = raw.AI_FEATURES;
export const AI_PLAN_LIMITS = raw.AI_PLAN_LIMITS;
export const aiFeatureCost = raw.aiFeatureCost;
export const getAiEntitlement = raw.getAiEntitlement;
export const preflightAiRequest = raw.preflightAiRequest;
export const getAiUsageSummary = raw.getAiUsageSummary;

const DEFAULT_FEATURE_COST_CEILINGS_USD = Object.freeze({
  caption: 0.002,
  hashtags: 0.001,
  emojis: 0.001,
  postIdeas: 0.004,
  doAll: 0.008,
  story: 0.01,
  memorySummary: 0.005,
  chat: 0.006,
  vision: 0.02,
  videoScript: 0.025,
  audioTranscribe: 0.025,
});

function costCeilingForFeature(feature) {
  const key = String(feature || '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const fallback = DEFAULT_FEATURE_COST_CEILINGS_USD[feature] || 0.01;
  const configured = Number(process.env[`AI_FEATURE_MAX_COST_${key}_USD`]);
  return Math.max(0.000001, Number.isFinite(configured) ? configured : fallback);
}

function rawActualCost(result, ceiling) {
  const reported = Number(result?.meta?.estimatedCost || 0);
  if (!Number.isFinite(reported) || reported <= 0) return ceiling;
  return Math.min(ceiling, reported);
}

export async function runAiTask(args) {
  const { db, user, feature, request } = args;

  const eligibility = await raw.preflightAiRequest({
    db,
    user,
    feature,
    prompt: args.prompt || args.input?.topic || args.input?.text || args.input?.query || 'AI request',
    media: args.media || null,
    multiplier: feature === 'doAll' ? 4 : 1,
    request,
  });
  if (!eligibility.ok) return eligibility;

  const estimatedCostUsd = costCeilingForFeature(feature);
  const gate = await reserveExternalAiSpend({
    db,
    user,
    request,
    feature,
    agentId: 'ai-router',
    estimatedCostUsd,
    essential: false,
    metadata: { source: 'ai-router', plan: eligibility.plan },
  });

  if (!gate.allowed) {
    const blocked = externalAiBlockedError(gate);
    return {
      ok: false,
      status: blocked.status,
      error: {
        code: blocked.code,
        message: blocked.message,
        weeklyWallet: gate.wallet || null,
        profitGuard: gate.profitGuard || null,
      },
    };
  }

  try {
    const result = await raw.runAiTask(args);
    if (!result.ok) {
      await releaseExternalAiSpend({ db, reservation: gate, reason: result.error?.code || 'ai_task_failed' });
      return result;
    }

    const actualCostUsd = rawActualCost(result, estimatedCostUsd);
    await settleExternalAiSpend({
      db,
      reservation: gate,
      actualCostUsd,
      feature,
      agentId: 'ai-router',
      userId: user.id,
      provider: result.meta?.provider || null,
      model: null,
      metadata: { requestId: result.meta?.requestId || null },
    });

    const wallet = await getUserAiWalletSnapshot({ db, user, request });
    return {
      ...result,
      meta: {
        ...(result.meta || {}),
        actualCostUsd,
        weeklyAiWallet: wallet,
        profitGuardApproved: true,
      },
    };
  } catch (error) {
    await releaseExternalAiSpend({ db, reservation: gate, reason: error?.code || 'ai_task_exception' });
    throw error;
  }
}
