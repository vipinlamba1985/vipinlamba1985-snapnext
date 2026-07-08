import { reserveAiSpend, settleAiSpend, releaseAiSpendReservation } from '@/lib/ai-profit-guard';
import { reserveUserAiWallet, settleUserAiWallet, releaseUserAiWalletReservation } from '@/lib/ai-weekly-wallet';

export async function reserveExternalAiSpend({ db, user, request = null, feature, agentId = null, estimatedCostUsd, essential = false, metadata = {} }) {
  const wallet = await reserveUserAiWallet({
    db,
    user,
    request,
    feature,
    estimatedCostUsd,
    metadata,
  });

  if (!wallet.allowed) {
    return {
      allowed: false,
      reason: wallet.reason,
      layer: 'user_wallet',
      wallet: wallet.snapshot || null,
      profitGuard: null,
    };
  }

  const profitGuard = await reserveAiSpend({
    db,
    feature,
    agentId,
    userId: user.id,
    estimatedCostUsd,
    essential,
    metadata,
  });

  if (!profitGuard.allowed) {
    await releaseUserAiWalletReservation({
      db,
      reservationId: wallet.reservationId,
      reason: `profit_guard_${profitGuard.reason}`,
    });
    return {
      allowed: false,
      reason: profitGuard.reason,
      layer: 'company_profit_guard',
      wallet: wallet.snapshot || null,
      profitGuard: profitGuard.snapshot || null,
    };
  }

  return {
    allowed: true,
    reason: 'wallet_and_profit_guard_approved',
    walletReservationId: wallet.reservationId,
    profitReservationId: profitGuard.reservationId,
    wallet: wallet.snapshot || null,
    profitGuard: profitGuard.snapshot || null,
  };
}

export async function settleExternalAiSpend({ db, reservation, actualCostUsd, feature, agentId = null, userId = null, provider = null, model = null, metadata = {} }) {
  if (!reservation?.allowed) return;
  await Promise.all([
    settleUserAiWallet({
      db,
      reservationId: reservation.walletReservationId,
      actualCostUsd,
      metadata: { provider, model, ...metadata },
    }),
    settleAiSpend({
      db,
      reservationId: reservation.profitReservationId,
      feature,
      agentId,
      userId,
      actualCostUsd,
      provider,
      model,
      metadata,
    }),
  ]);
}

export async function releaseExternalAiSpend({ db, reservation, reason = 'released' }) {
  if (!reservation?.allowed) return;
  await Promise.all([
    releaseUserAiWalletReservation({ db, reservationId: reservation.walletReservationId, reason }),
    releaseAiSpendReservation({ db, reservationId: reservation.profitReservationId, reason }),
  ]);
}

export function externalAiBlockedError(gate) {
  if (gate?.layer === 'user_wallet') {
    if (gate.reason === 'external_ai_not_in_plan') {
      return {
        code: 'external_ai_not_in_plan',
        message: 'Your plan does not include paid external AI. SnapNext will use local and internal intelligence where available.',
        status: 403,
      };
    }
    return {
      code: 'weekly_ai_wallet_exhausted',
      message: 'Your weekly AI allowance has been used. It resets automatically next week.',
      status: 429,
    };
  }

  return {
    code: 'profit_guard_blocked',
    message: gate?.reason === 'no_recognized_revenue'
      ? 'External AI is temporarily paused until revenue-backed AI budget is available.'
      : 'External AI is temporarily paused to protect SnapNext profit margin.',
    status: 402,
  };
}
