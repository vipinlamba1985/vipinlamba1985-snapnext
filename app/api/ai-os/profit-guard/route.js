export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { isSuperUser } from '@/lib/entitlements';
import { getAiProfitGuardSnapshot } from '@/lib/ai-profit-guard';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user || !isSuperUser(user, request)) {
    return Response.json({ error: { code: 'forbidden', message: 'AI Profit Guard is admin-only.' } }, { status: 403 });
  }

  const db = await getDb();
  const snapshot = await getAiProfitGuardSnapshot({ db });
  return Response.json({ ok: true, snapshot });
}
