import { getUserFromRequest } from '@/lib/auth';
import { isSuperUser } from '@/lib/entitlements';
import { getDb } from '@/lib/db';
import { runDevAI } from '@/lib/dev-ai';
import { externalAiBlockedError, releaseExternalAiSpend, reserveExternalAiSpend, settleExternalAiSpend } from '@/lib/ai-spend-gate';
import { getUserAiWalletSnapshot } from '@/lib/ai-weekly-wallet';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DAILY_LIMIT = Math.max(1, Number(process.env.DEV_AI_DAILY_REQUEST_LIMIT || 50));
const MAX_REQUEST_COST_USD = Math.max(0.01, Number(process.env.DEV_AI_MAX_REQUEST_COST_USD || 1));
const INPUT_COST_PER_1M_USD = Math.max(0, Number(process.env.OPENAI_DEV_INPUT_COST_PER_1M_USD || 10));
const OUTPUT_COST_PER_1M_USD = Math.max(0, Number(process.env.OPENAI_DEV_OUTPUT_COST_PER_1M_USD || 30));

function startOfUtcDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function estimateActualCost(usage = {}) {
  const inputTokens = Math.max(0, Number(usage.input_tokens || 0));
  const outputTokens = Math.max(0, Number(usage.output_tokens || 0));
  return Number((((inputTokens / 1_000_000) * INPUT_COST_PER_1M_USD) + ((outputTokens / 1_000_000) * OUTPUT_COST_PER_1M_USD)).toFixed(6));
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user || !isSuperUser(user, request)) {
    return Response.json({ error: { code: 'forbidden', message: 'SnapNext Dev AI is admin-only.' } }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const message = String(body.message || '').trim();
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];

  if (!message) {
    return Response.json({ error: { code: 'invalid_request', message: 'Enter a coding question or task.' } }, { status: 400 });
  }
  if (message.length > 16000) {
    return Response.json({ error: { code: 'too_large', message: 'The request is too large.' } }, { status: 413 });
  }

  const db = await getDb();
  const collection = db.collection('dev_ai_usage');
  const usedToday = await collection.countDocuments({ userId: user.id, createdAt: { $gte: startOfUtcDay() } });
  if (usedToday >= DAILY_LIMIT) {
    return Response.json({ error: { code: 'daily_limit', message: `Dev AI daily request limit reached (${DAILY_LIMIT}).` } }, { status: 429 });
  }

  const gate = await reserveExternalAiSpend({
    db,
    user,
    request: null,
    feature: 'dev_ai',
    agentId: 'dev-ai',
    estimatedCostUsd: MAX_REQUEST_COST_USD,
    essential: false,
    metadata: { requestType: 'repository_analysis' },
  });

  if (!gate.allowed) {
    const blocked = externalAiBlockedError(gate);
    return Response.json({
      error: { code: blocked.code, message: blocked.message },
      weeklyWallet: gate.wallet || null,
      profitGuard: gate.profitGuard || null,
    }, { status: blocked.status });
  }

  const startedAt = Date.now();
  try {
    const result = await runDevAI({ message, history });
    const actualCostUsd = estimateActualCost(result.usage);

    await settleExternalAiSpend({
      db,
      reservation: gate,
      actualCostUsd,
      feature: 'dev_ai',
      agentId: 'dev-ai',
      userId: user.id,
      provider: 'openai',
      model: result.model,
      metadata: { inputTokens: Number(result.usage?.input_tokens || 0), outputTokens: Number(result.usage?.output_tokens || 0) },
    });

    await collection.insertOne({
      userId: user.id,
      model: result.model,
      inputTokens: Number(result.usage?.input_tokens || 0),
      outputTokens: Number(result.usage?.output_tokens || 0),
      totalTokens: Number(result.usage?.total_tokens || 0),
      estimatedCostUsd: actualCostUsd,
      toolCalls: result.tools?.length || 0,
      success: true,
      durationMs: Date.now() - startedAt,
      createdAt: new Date(),
    }).catch((error) => console.error('[dev-ai] usage log failed', error?.message));

    const weeklyWallet = await getUserAiWalletSnapshot({ db, user, request: null });
    return Response.json({
      ok: true,
      ...result,
      estimatedCostUsd: actualCostUsd,
      limits: { usedToday: usedToday + 1, dailyLimit: DAILY_LIMIT },
      weeklyWallet,
      profitGuard: {
        remainingAiBudgetUsd: gate.profitGuard?.remainingAiBudgetUsd ?? null,
        targetProfitMargin: gate.profitGuard?.targetProfitMargin ?? null,
      },
    });
  } catch (error) {
    await releaseExternalAiSpend({ db, reservation: gate, reason: 'dev_ai_failed' });
    console.error('[dev-ai] request failed', error?.message);
    await collection.insertOne({
      userId: user.id,
      model: process.env.OPENAI_DEV_MODEL || 'gpt-5.5',
      success: false,
      errorCode: error?.code || 'dev_ai_failed',
      durationMs: Date.now() - startedAt,
      createdAt: new Date(),
    }).catch(() => null);
    return Response.json({ error: { code: 'dev_ai_failed', message: error?.message || 'Dev AI could not complete this request.' } }, { status: 500 });
  }
}
