export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { isSuperUser } from '@/lib/entitlements';
import { getAiAlerts } from '@/lib/ai-task-preview';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to view AI alerts.' } }, { status: 401 });
  }
  if (!isSuperUser(user, request)) {
    return Response.json({ error: { code: 'feature_not_available', message: 'AI alerts are available to Super User only.' } }, { status: 403 });
  }

  const db = await getDb();
  const alerts = await getAiAlerts({ db });
  return Response.json(alerts);
}
