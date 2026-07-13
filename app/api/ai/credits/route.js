export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getUserAiWalletSnapshot } from '@/lib/ai-weekly-wallet';
import { aiCreditPlanSummary, walletAmountToAiCredits, weeklyAiCreditsForPlan } from '@/lib/ai-credits';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const wallet = await getUserAiWalletSnapshot({ db, user, request });
  const weeklyCredits = weeklyAiCreditsForPlan(wallet.plan);
  const usedCredits = walletAmountToAiCredits(wallet.spentUsd, wallet.weeklyLimitUsd, wallet.plan);
  const reservedCredits = walletAmountToAiCredits(wallet.reservedUsd, wallet.weeklyLimitUsd, wallet.plan);
  const remainingCredits = Math.max(0, weeklyCredits - usedCredits - reservedCredits);

  return Response.json({
    plan: wallet.plan,
    weeklyCredits,
    usedCredits,
    reservedCredits,
    remainingCredits,
    resetsAt: wallet.resetsAt,
    planComparison: aiCreditPlanSummary(),
    policy: {
      unit: 'included_ai_capacity',
      cachedResultsCostCredits: 0,
      coreFeaturesContinueWhenEmpty: true,
    },
  });
}
