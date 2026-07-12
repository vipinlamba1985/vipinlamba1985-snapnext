export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getUserAiWalletSnapshot } from '@/lib/ai-weekly-wallet';
import { aiCreditPlanSummary, usdToAiCredits } from '@/lib/ai-credits';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const wallet = await getUserAiWalletSnapshot({ db, user, request });
  return Response.json({
    plan: wallet.plan,
    weeklyCredits: usdToAiCredits(wallet.weeklyLimitUsd),
    usedCredits: usdToAiCredits(wallet.spentUsd),
    reservedCredits: usdToAiCredits(wallet.reservedUsd),
    remainingCredits: usdToAiCredits(wallet.remainingUsd),
    resetsAt: wallet.resetsAt,
    planComparison: aiCreditPlanSummary(),
  });
}
