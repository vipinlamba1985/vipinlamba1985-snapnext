export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { isSuperUser } from '@/lib/entitlements';
import { getBusinessIntelligenceSnapshot } from '@/lib/ai-learning-engine';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to view AI business intelligence.' } }, { status: 401 });
  }
  if (!isSuperUser(user)) {
    return Response.json({ error: { code: 'feature_not_available', message: 'AI business intelligence is available to Super User only.' } }, { status: 403 });
  }

  const db = await getDb();
  const snapshot = await getBusinessIntelligenceSnapshot({ db });
  return Response.json(snapshot);
}
