export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { previewAiTask } from '@/lib/ai-task-preview';
import { isFeatureEnabled } from '@/lib/entitlements';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to preview AI tasks.' } }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (!isFeatureEnabled('aiCommand', request)) {
    return Response.json({ error: { code: 'feature_disabled', message: 'AI Command is disabled in Developer Test Mode.' } }, { status: 403 });
  }
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
