export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { resetAiIndexForUser } from '@/lib/universal-ai-index';

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in.' } }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (body.confirm !== 'DELETE_AI_INDEX') {
    return Response.json({
      error: { code: 'confirmation_required', message: 'Explicit confirmation is required to reset AI intelligence data.' },
    }, { status: 409 });
  }

  const db = await getDb();
  const deleted = await resetAiIndexForUser({ db, userId: user.id });
  return Response.json({ ok: true, ...deleted });
}
