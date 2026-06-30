export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { isSuperUser } from '@/lib/entitlements';
import { applyRollbackRecommendation, getRollbackRecommendations } from '@/lib/ai-safety-automation';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to view AI safety automation.' } }, { status: 401 });
  }
  if (!isSuperUser(user)) {
    return Response.json({ error: { code: 'feature_not_available', message: 'AI safety automation is available to Super User only.' } }, { status: 403 });
  }
  const db = await getDb();
  return Response.json(await getRollbackRecommendations({ db }));
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to apply AI safety automation.' } }, { status: 401 });
  }
  if (!isSuperUser(user)) {
    return Response.json({ error: { code: 'feature_not_available', message: 'AI safety automation is available to Super User only.' } }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  const result = await applyRollbackRecommendation({ db, user, body });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 400 });
  return Response.json(result);
}
