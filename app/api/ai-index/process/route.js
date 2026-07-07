export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { aiIndexAccess } from '@/lib/ai-index-access';
import { processAnalysisJobs } from '@/lib/analysis-queue';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  const access = aiIndexAccess({ user, request, allowWorker: true });
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(5, Number(body.limit) || 1));
  const userId = access.worker ? (body.userId ? String(body.userId) : null) : user.id;
  const db = await getDb();
  const result = await processAnalysisJobs({ db, userId, limit });
  return Response.json({ ok: true, ...result });
}
