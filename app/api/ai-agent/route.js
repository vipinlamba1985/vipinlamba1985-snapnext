export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { runChiefAiTask } from '@/lib/ai-os';
import { retrieveGroundedMemoryContext } from '@/lib/ai-memory-retrieval';
import { recordSupervisorEvent, supervisorDecision } from '@/lib/ai-supervisor';

export async function POST(request) {
  const startedAt = Date.now();
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const task = typeof body.task === 'string' ? body.task.trim() : '';
  if (!task) return Response.json({ error: { code: 'invalid_prompt', message: 'Task prompt is required.' } }, { status: 400 });
  if (task.length > 2000) return Response.json({ error: { code: 'invalid_prompt', message: 'Please keep AI tasks under 2,000 characters.' } }, { status: 400 });

  const db = await getDb();
  const feature = body.feature || 'postIdeas';
  const memoryContext = await retrieveGroundedMemoryContext(db, user.id, task);
  const groundedPrompt = `User request: ${task}\n\n${memoryContext.promptBlock}`.slice(0, 7000);
  const decision = supervisorDecision({ user, feature, prompt: groundedPrompt, media: body.media || null, qualityMode: body.qualityMode || 'balanced', request });

  await recordSupervisorEvent({
    db,
    user,
    feature,
    decision,
    status: 'started',
    matchedMediaCount: memoryContext.selected.length,
  });

  const result = await runChiefAiTask({
    db,
    user,
    feature,
    input: {
      topic: task,
      text: task,
      memoryContext: memoryContext.selected,
      ...(body.input || {}),
    },
    prompt: groundedPrompt,
    media: body.media || null,
    request,
    qualityMode: body.qualityMode || 'balanced',
  });

  if (!result.ok) {
    await recordSupervisorEvent({
      db,
      user,
      feature,
      decision,
      provider: result.error?.provider || null,
      latencyMs: Date.now() - startedAt,
      status: 'failed',
      errorCode: result.error?.code || 'ai_failed',
      matchedMediaCount: memoryContext.selected.length,
    });
    return Response.json({ error: result.error, aiOs: result.aiOs || null }, { status: result.status || 400 });
  }

  await recordSupervisorEvent({
    db,
    user,
    requestId: result.meta?.requestId,
    feature,
    decision,
    provider: result.meta?.provider || null,
    credits: result.meta?.creditsUsed || 0,
    estimatedCost: result.meta?.estimatedCost || 0,
    latencyMs: result.meta?.responseTimeMs || (Date.now() - startedAt),
    status: 'completed',
    matchedMediaCount: memoryContext.selected.length,
  });

  const generated = result.result || {};
  const summary = memoryContext.totalAvailable
    ? memoryContext.indexedAvailable
      ? `Grounded in ${memoryContext.selected.length} relevant memories from your library, including rich intelligence from ${memoryContext.indexedAvailable} indexed assets.`
      : `Grounded in ${memoryContext.selected.length} relevant memories from your library.`
    : 'No saved media context was available yet, so this draft is general.';

  return Response.json({
    result: {
      title: 'SnapNext AI Draft',
      summary,
      caption: generated?.text || generated?.reply || generated?.caption || JSON.stringify(generated?.ideas || generated),
      hashtags: generated?.hashtags ? [String(generated.hashtags)] : ['#snapnext', '#memories', '#digitalLife'],
      steps: ['Review the draft', 'Adjust the tone', 'Save or share'],
      draftType: 'Social Post',
      matchedMediaIds: memoryContext.selected.map((item) => item.id),
    },
    meta: {
      ...(result.meta || {}),
      supervisor: {
        path: decision.path,
        matchedMediaCount: memoryContext.selected.length,
        indexedAvailable: memoryContext.indexedAvailable,
      },
    },
    aiOs: result.aiOs,
  });
}
