export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { previewAiTask } from '@/lib/ai-task-preview';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to preview AI tasks.' } }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const task = typeof body.task === 'string' ? body.task.trim() : '';
  if (!task) {
    return Response.json({ error: { code: 'invalid_prompt', message: 'Task prompt is required.' } }, { status: 400 });
  }

  const db = await getDb();
  const preview = await previewAiTask({
    db,
    user,
    task,
    feature: body.feature || 'chat',
    input: body.input || {},
    media: body.media || null,
    qualityMode: body.qualityMode || 'balanced',
  });

  return Response.json(preview);
}
