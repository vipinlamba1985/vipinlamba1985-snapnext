export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { recordAiFeedback } from '@/lib/ai-learning-engine';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to send AI feedback.' } }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  const result = await recordAiFeedback({ db, user, body });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 400 });

  return Response.json({
    ok: true,
    feedback: {
      id: result.feedback.id,
      agentId: result.feedback.agentId,
      rating: result.feedback.rating,
      positive: result.feedback.positive,
      createdAt: result.feedback.createdAt,
    },
  });
}
