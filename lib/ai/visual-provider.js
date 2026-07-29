import { randomUUID } from 'crypto';
import { executeAiGatewayTask } from '@/lib/ai/gateway';
import { preflightAiRequest } from '@/lib/ai-router';

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function finiteCost(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export async function executeVisualProviderTask({
  db,
  user,
  request,
  taskId,
  entitlementFeature,
  creditMultiplier = 1,
  approved,
  prompt,
  media,
  providerUrl,
  providerKey,
  providerBody,
  providerName = 'visual_generation',
  metadata = {},
}) {
  return executeAiGatewayTask({
    db,
    user,
    request,
    taskId,
    approved,
    prompt,
    media,
    metadata,
    preflight: () => preflightAiRequest({
      db,
      user,
      feature: entitlementFeature,
      prompt: prompt || taskId,
      media,
      multiplier: creditMultiplier,
      request,
    }),
    execute: async () => {
      const response = await fetch(providerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(providerKey ? { Authorization: `Bearer ${providerKey}` } : {}),
        },
        body: JSON.stringify(providerBody),
      });
      if (!response.ok) {
        const error = new Error(`Provider returned ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const data = await response.json();
      const outputUrl = String(data.outputUrl || data.url || '').trim().slice(0, 2_000);
      if (!outputUrl) {
        const error = new Error('Provider returned no output URL.');
        error.code = 'provider_output_missing';
        throw error;
      }
      const actualCostUsd = finiteCost(data.actualCostUsd ?? data.costUsd ?? data.usage?.costUsd);
      return {
        result: {
          outputUrl,
          providerJobId: data.jobId || data.id || null,
          providerStatus: data.status || 'completed',
        },
        provider: data.provider || providerName,
        model: data.model || null,
        actualCostUsd,
        costBasis: actualCostUsd == null ? 'ceiling_fallback' : 'provider_reported',
        providerUsage: data.usage || null,
      };
    },
    validateResult: (result) => result?.outputUrl
      ? { ok: true }
      : { ok: false, status: 502, error: { code: 'provider_output_missing', message: 'The provider returned no usable output.' } },
    onSuccess: async ({ requestId, eligibility, execution, durationMs, actualCostUsd }) => {
      await db.collection('ai_usage').insertOne({
        id: randomUUID(),
        requestId,
        userId: user.id,
        plan: eligibility.plan,
        feature: taskId,
        provider: execution.provider,
        model: execution.model,
        credits: eligibility.credits,
        estimatedCost: actualCostUsd,
        actualCostUsd,
        costBasis: execution.costBasis,
        providerUsage: execution.providerUsage,
        durationMs,
        status: 'success',
        errorCode: null,
        day: dayKey(),
        month: monthKey(),
        createdAt: new Date(),
      });
    },
    onFailure: async ({ requestId, eligibility, execution, error, durationMs }) => {
      await db.collection('ai_usage').insertOne({
        id: randomUUID(),
        requestId,
        userId: user.id,
        plan: eligibility?.plan || user.plan || 'free',
        feature: taskId,
        provider: execution?.provider || providerName,
        model: execution?.model || null,
        credits: 0,
        estimatedCost: 0,
        actualCostUsd: 0,
        costBasis: 'failed_not_charged',
        providerUsage: null,
        durationMs,
        status: 'failed',
        errorCode: execution?.error?.code || error?.code || 'provider_failed',
        day: dayKey(),
        month: monthKey(),
        createdAt: new Date(),
      }).catch(() => null);
    },
  });
}
