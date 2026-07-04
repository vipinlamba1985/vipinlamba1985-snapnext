export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { isSuperUser } from '@/lib/entitlements';
import { getSupervisorSummary } from '@/lib/ai-supervisor';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user || !isSuperUser(user, request)) {
    return Response.json({ error: { code: 'forbidden', message: 'AI Supervisor analytics are admin-only.' } }, { status: 403 });
  }
  const daysParam = new URL(request.url).searchParams.get('days');
  const days = Math.min(90, Math.max(1, Number(daysParam) || 30));
  const db = await getDb();
  const summary = await getSupervisorSummary({ db, days });
  return Response.json(summary);
}
