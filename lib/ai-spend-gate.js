import { reserveAiSpend, settleAiSpend, releaseAiSpendReservation } from '@/lib/ai-profit-guard';
import { reserveUserAiWallet, settleUserAiWallet, releaseUserAiWalletReservation } from '@/lib/ai-weekly-wallet';

export async function reserveExternalAiSpend({ db, user, request = null, feature, agentId = null, estimatedCostUsd, essential = false, metadata = {} }) {
  const approvedCostUsd = Math.max(0, Number(estimatedCostUsd) || 0);
  const wallet = await reserveUserAiWallet({ db, user, request, feature, estimatedCostUsd: approvedCostUsd, metadata });

  if (!wallet.allowed) {
    return { allowed: false, reason: wallet.reason, layer: 'user_wallet', wallet: wallet.snapshot || null, profitGuard: null };
  }

  const profitGuard = await reserveAiSpend({ db, feature, agentId, userId: user.id, estimatedCostUsd: approvedCostUsd, essential, metadata });

  if (!profitGuard.allowed) {
    await releaseUserAiWalletReservation({ db, reservationId: wallet.reservationId, reason: `profit_guard_${profitGuard.reason}` });
    return { allowed: false, reason: profitGuard.reason, layer: 'company_profit_guard', wallet: wallet.snapshot || null, profitGuard: profitGuard.snapshot || null };
  }

  return {
    allowed: true,
    reason: 'wallet_and_profit_guard_approved',
    approvedCostUsd,
    walletReservationId: wallet.reservationId,
    profitReservationId: profitGuard.reservationId,
    wallet: wallet.snapshot || null,
    profitGuard: profitGuard.snapshot || null,
  };
}

export async function settleExternalAiSpend({ db, reservation, actualCostUsd, feature, agentId = null, userId = null, provider = null, model = null, metadata = {} }) {
  if (!reservation?.allowed) return;
  const actual = Math.max(0, Number(actualCostUsd) || 0);
  const approved = Math.max(0, Number(reservation.approvedCostUsd) || 0);
  const settledCostUsd = Math.min(actual, approved);

  await Promise.all([
    settleUserAiWallet({ db, reservationId: reservation.walletReservationId, actualCostUsd: settledCostUsd, metadata: { provider, model, approvedCostUsd: approved, reportedActualCostUsd: actual, ...metadata } }),
    settleAiSpend({ db, reservationId: reservation.profitReservationId, feature, agentId, userId, actualCostUsd: settledCostUsd, provider, model, metadata: { approvedCostUsd: approved, reportedActualCostUsd: actual, ...metadata } }),
  ]);

  return { settledCostUsd, approvedCostUsd: approved, reportedActualCostUsd: actual };
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
        message: 'This AI creation tool is not included in your current plan. Your saved memories and zero-credit search remain available.',
        status: 403,
      };
    }
    return {
      code: 'weekly_ai_wallet_exhausted',
      message: 'Your weekly AI allowance has been used. It resets automatically next week, and your saved memories remain available.',
      status: 429,
    };
  }

  return {
    code: 'profit_guard_blocked',
    message: 'AI creation is temporarily unavailable. Your photos, uploads, downloads, search, and saved memories remain available.',
    status: 503,
  };
}
