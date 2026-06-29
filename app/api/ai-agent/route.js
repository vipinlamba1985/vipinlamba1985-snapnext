export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { runChiefAiTask } from '@/lib/ai-os';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const task = typeof body.task === 'string' ? body.task.trim() : '';
  if (!task) {
    return Response.json({ error: { code: 'invalid_prompt', message: 'Task prompt is required.' } }, { status: 400 });
  }

  const db = await getDb();
  const result = await runChiefAiTask({
    db,
    user,
    feature: body.feature || 'postIdeas',
    input: { topic: task, text: task },
    prompt: task,
    request,
    qualityMode: body.qualityMode || 'balanced',
  });

  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 400 });

  const generated = result.result;
  return Response.json({
    result: {
      title: 'SnapNext AI Draft',
      summary: 'SnapNext generated a ready-to-review creative draft.',
      caption: generated?.text || JSON.stringify(generated?.ideas || generated),
      hashtags: ['#snapnext', '#memories', '#digitalLife'],
      steps: ['Review the draft', 'Adjust the tone', 'Save or share'],
      draftType: 'Social Post',
    },
    meta: result.meta,
    aiOs: result.aiOs,
  });
}
