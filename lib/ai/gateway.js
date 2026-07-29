import { createHash, randomUUID } from 'crypto';
import { externalAiBlockedError, releaseExternalAiSpend, reserveExternalAiSpend, settleExternalAiSpend } from '@/lib/ai-spend-gate';
import { getUserAiWalletSnapshot } from '@/lib/ai-weekly-wallet';
import { aiTaskCostCeiling, getAiTask, getTaskModel } from '@/lib/ai/registry';

function structuredError(code, message, status = 400, extra = {}) {
  return { ok: false, status, error: { code, message, ...extra } };
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hashValue(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function timeoutError() {
  const error = new Error('AI provider timed out.');
  error.code = 'ai_provider_timeout';
  error.retryable = true;
  return error;
}

async function withTimeout(operation, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(timeoutError()), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function retryable(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return error?.retryable === true
    || status === 408
    || status === 409
    || status === 429
    || status >= 500
    || code.includes('timeout')
    || code.includes('rate')
    || code.includes('unavailable')
    || message.includes('temporarily unavailable')
    || message.includes('overloaded');
}

async function executeResilient(task, execute) {
  let lastError;
  const attempts = Math.max(1, Number(task.maxAttempts) || 1);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await withTimeout(() => execute({ task, attempt }), task.timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !retryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(2_000, 250 * (2 ** (attempt - 1)))));
    }
  }
  throw lastError;
}

function normalizeExecution(execution, task) {
  if (execution?.ok === false) return execution;
  const configuredModel = getTaskModel(task.id);
  const result = Object.prototype.hasOwnProperty.call(execution || {}, 'result') ? execution.result : execution;
  const actual = Number(execution?.actualCostUsd ?? execution?.usage?.costUsd);
  const hasActual = Number.isFinite(actual) && actual >= 0;
  return {
    ok: true,
    result,
    provider: execution?.provider || configuredModel?.provider || task.primary.provider,
    model: execution?.model || configuredModel?.id || null,
    actualCostUsd: hasActual ? actual : null,
    costBasis: execution?.costBasis || (hasActual ? 'provider_reported_or_token_calculated' : 'ceiling_fallback'),
    providerUsage: execution?.providerUsage || execution?.usage || null,
    metadata: execution?.metadata || null,
  };
}

async function recordAudit(db, row) {
  if (!db) return;
  await db.collection('ai_audit').insertOne({
    id: randomUUID(),
    ...row,
    createdAt: new Date(),
  }).catch(() => null);
}

export async function executeAiGatewayTask({
  db,
  user,
  request = null,
  taskId,
  approved = false,
  prompt = '',
  input = {},
  media = null,
  metadata = {},
  preflight = null,
  deterministic = null,
  cacheLookup = null,
  privacyCheck = null,
  validateResult = null,
  execute,
  onSuccess = null,
  onFailure = null,
}) {
  const startedAt = Date.now();
  const task = getAiTask(taskId);
  if (!task) return structuredError('ai_task_not_registered', 'This AI task is not registered.', 404, { taskId });
  if (!user?.id) return structuredError('unauthenticated', 'Please sign in to use SnapNext AI.', 401);
  if (task.approvalRequired && approved !== true) {
    return structuredError('approval_required', 'Review the price and confirm this AI creation before it starts.', 409, {
      taskId,
      maximumCostUsd: task.maxCostUsd,
      approvalRequired: true,
    });
  }

  const requestId = randomUUID();
  const inputHash = hashValue(JSON.stringify({ prompt, input, media: media ? { mimeType: media.mimeType, size: media.size, mediaId: media.mediaId } : null }));

  if (privacyCheck) {
    const privacy = await privacyCheck({ task, user, prompt, input, media, request });
    if (privacy?.ok === false) {
      await recordAudit(db, { requestId, userId: user.id, taskId, status: 'privacy_blocked', inputHash, errorCode: privacy.error?.code || 'privacy_blocked' });
      return privacy;
    }
  }

  let eligibility = { ok: true, plan: user.plan || 'free', credits: 0 };
  if (preflight) {
    eligibility = await preflight({ task, requestId });
    if (!eligibility?.ok) return eligibility;
  }

  if (task.deterministicFirst && deterministic) {
    const local = await deterministic({ task, user, prompt, input, media, request });
    if (local?.hit) {
      await recordAudit(db, { requestId, userId: user.id, taskId, status: 'deterministic_hit', inputHash, provider: 'deterministic', model: null, actualCostUsd: 0, costBasis: 'no_external_ai' });
      return {
        ok: true,
        result: local.result,
        meta: {
          requestId,
          provider: 'deterministic',
          model: null,
          plan: eligibility.plan,
          creditsUsed: 0,
          actualCostUsd: 0,
          costBasis: 'no_external_ai',
          responseTimeMs: Date.now() - startedAt,
          cache: false,
        },
      };
    }
  }

  if (cacheLookup) {
    const cached = await cacheLookup({ task, user, prompt, input, media, request });
    if (cached?.hit) {
      await recordAudit(db, { requestId, userId: user.id, taskId, status: 'cache_hit', inputHash, provider: 'cache', model: cached.model || null, actualCostUsd: 0, costBasis: 'cached' });
      return {
        ok: true,
        result: cached.result,
        meta: {
          requestId,
          provider: cached.provider || 'cache',
          model: cached.model || null,
          plan: eligibility.plan,
          creditsUsed: 0,
          actualCostUsd: 0,
          costBasis: 'cached',
          responseTimeMs: Date.now() - startedAt,
          cache: true,
        },
      };
    }
  }

  const estimatedCostUsd = aiTaskCostCeiling(taskId);
  const reservation = await reserveExternalAiSpend({
    db,
    user,
    request,
    feature: task.featureId,
    agentId: task.pipeline,
    estimatedCostUsd,
    essential: false,
    metadata: {
      taskId,
      requestId,
      inputHash,
      plan: eligibility.plan,
      primaryProvider: task.primary.provider,
      ...metadata,
    },
  });

  if (!reservation.allowed) {
    const blocked = externalAiBlockedError(reservation);
    await recordAudit(db, { requestId, userId: user.id, taskId, status: 'budget_blocked', inputHash, errorCode: blocked.code, maximumCostUsd: estimatedCostUsd });
    return structuredError(blocked.code, blocked.message, blocked.status, {
      taskId,
      weeklyWallet: reservation.wallet || null,
      profitGuard: reservation.profitGuard || null,
      coreVaultAvailable: true,
    });
  }

  try {
    const execution = normalizeExecution(await executeResilient(task, execute), task);
    if (!execution.ok) {
      await releaseExternalAiSpend({ db, reservation, reason: execution.error?.code || 'ai_task_failed' });
      if (onFailure) await onFailure({ requestId, eligibility, execution, durationMs: Date.now() - startedAt });
      return execution;
    }
    if (validateResult) {
      const validation = await validateResult(execution.result, { task, execution });
      if (validation?.ok === false) {
        await releaseExternalAiSpend({ db, reservation, reason: validation.error?.code || 'ai_output_invalid' });
        if (onFailure) await onFailure({ requestId, eligibility, execution: validation, durationMs: Date.now() - startedAt });
        return validation;
      }
    }

    const approvedCost = Math.max(0, finite(reservation.approvedCostUsd, estimatedCostUsd));
    const actualCostUsd = execution.actualCostUsd == null
      ? approvedCost
      : Math.min(approvedCost, Math.max(0, execution.actualCostUsd));
    const settlement = await settleExternalAiSpend({
      db,
      reservation,
      actualCostUsd,
      feature: task.featureId,
      agentId: task.pipeline,
      userId: user.id,
      provider: execution.provider,
      model: execution.model,
      metadata: {
        taskId,
        requestId,
        costBasis: execution.costBasis,
        providerUsage: execution.providerUsage,
        ...metadata,
      },
    });

    const durationMs = Date.now() - startedAt;
    if (onSuccess) {
      await onSuccess({
        requestId,
        eligibility,
        execution,
        durationMs,
        actualCostUsd: settlement?.settledCostUsd ?? actualCostUsd,
      });
    }
    const wallet = await getUserAiWalletSnapshot({ db, user, request }).catch(() => null);
    await recordAudit(db, {
      requestId,
      userId: user.id,
      taskId,
      feature: task.featureId,
      status: 'succeeded',
      inputHash,
      outputHash: hashValue(JSON.stringify(execution.result)),
      provider: execution.provider,
      model: execution.model,
      maximumCostUsd: estimatedCostUsd,
      actualCostUsd: settlement?.settledCostUsd ?? actualCostUsd,
      costBasis: execution.costBasis,
      durationMs,
      approvalRequired: task.approvalRequired,
      approved: approved === true,
    });

    return {
      ok: true,
      result: execution.result,
      meta: {
        requestId,
        provider: execution.provider,
        model: execution.model,
        plan: eligibility.plan,
        creditsUsed: eligibility.credits || 0,
        creditsRemaining: Math.max(0, finite(eligibility.creditsRemaining) - finite(eligibility.credits)),
        dailyCreditsRemaining: Math.max(0, finite(eligibility.dailyCreditsRemaining) - finite(eligibility.credits)),
        actualCostUsd: settlement?.settledCostUsd ?? actualCostUsd,
        estimatedCostUsd,
        costBasis: execution.costBasis,
        providerUsage: execution.providerUsage,
        responseTimeMs: durationMs,
        weeklyAiWallet: wallet,
        profitGuardApproved: true,
        cache: false,
      },
    };
  } catch (error) {
    await releaseExternalAiSpend({ db, reservation, reason: error?.code || 'ai_task_exception' });
    const durationMs = Date.now() - startedAt;
    if (onFailure) await onFailure({ requestId, eligibility, error, durationMs });
    await recordAudit(db, {
      requestId,
      userId: user.id,
      taskId,
      status: 'failed',
      inputHash,
      errorCode: error?.code || 'ai_provider_failed',
      durationMs,
    });
    return structuredError(
      error?.code || 'ai_provider_failed',
      error?.code === 'ai_provider_timeout' ? 'The AI provider timed out. Please try again.' : 'AI could not complete this task right now.',
      error?.code === 'ai_provider_timeout' ? 504 : 502,
      { taskId, retryable: retryable(error) },
    );
  }
}
