export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getUserAiWalletSnapshot } from '@/lib/ai-weekly-wallet';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to view your AI allowance.' } }, { status: 401 });
  }

  const db = await getDb();
  const wallet = await getUserAiWalletSnapshot({ db, user, request });
  return Response.json({
    ok: true,
    wallet,
    policy: {
      reset: 'weekly',
      rollover: false,
      freeExternalAiUsd: 0,
      requiresCompanyProfitGuard: true,
    },
  });
}
