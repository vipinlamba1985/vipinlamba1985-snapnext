export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { runChiefAiTask } from '@/lib/ai-os';

function termsFrom(text) {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'make', 'create', 'write', 'draft', 'help', 'please', 'photo', 'photos', 'picture', 'pictures', 'video', 'videos', 'memory', 'memories', 'recent', 'latest', 'saved']);
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2 && !stop.has(term))
    .slice(0, 10);
}

function mediaText(media) {
  return [
    media.name,
    media.kind,
    media.aiAnalysis?.autoAlbum,
    media.aiAnalysis?.description,
    ...(media.aiAnalysis?.tags || []),
    ...(media.aiAnalysis?.locations || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function scoreMedia(media, terms) {
  let score = 0;
  const text = mediaText(media);
  for (const term of terms) if (text.includes(term)) score += 8;
  if (media.favorite || media.isFavorite) score += 6;
  if (media.aiAnalysis?.description) score += 4;
  if ((media.aiAnalysis?.tags || []).length) score += 2;
  if (media.kind === 'photo') score += 1;
  const created = new Date(media.createdAt || 0).getTime();
  if (Number.isFinite(created)) score += Math.max(0, 3 - (Date.now() - created) / (1000 * 60 * 60 * 24 * 90));
  return score;
}

function compactMedia(media) {
  return {
    id: media.id,
    name: String(media.name || '').slice(0, 80),
    kind: media.kind,
    createdAt: media.createdAt,
    favorite: !!(media.favorite || media.isFavorite),
    tags: (media.aiAnalysis?.tags || []).slice(0, 5),
    locations: (media.aiAnalysis?.locations || []).slice(0, 3),
    album: media.aiAnalysis?.autoAlbum || '',
    description: String(media.aiAnalysis?.description || '').slice(0, 220),
  };
}

async function retrieveGroundedMemoryContext(db, userId, task) {
  const terms = termsFrom(task);
  const items = await db.collection('media')
    .find({ userId, trashed: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(150)
    .toArray();

  if (!items.length) {
    return { totalAvailable: 0, selected: [], promptBlock: 'Verified memory context: no saved media found for this user yet.' };
  }

  const selected = items
    .map((media) => ({ media, score: scoreMedia(media, terms) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ media }) => compactMedia(media));

  const promptBlock = JSON.stringify({
    rule: 'Use only this verified user memory context. Do not invent people, places, dates, relationships, trips, or counts. If context is insufficient, say so clearly.',
    totalAvailable: items.length,
    selected,
  });

  return { totalAvailable: items.length, selected, promptBlock };
}

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
  if (task.length > 2000) {
    return Response.json({ error: { code: 'invalid_prompt', message: 'Please keep AI tasks under 2,000 characters.' } }, { status: 400 });
  }

  const db = await getDb();
  const memoryContext = await retrieveGroundedMemoryContext(db, user.id, task);
  const groundedPrompt = `User request: ${task}\n\n${memoryContext.promptBlock}`.slice(0, 5500);

  const result = await runChiefAiTask({
    db,
    user,
    feature: body.feature || 'postIdeas',
    input: { topic: task, text: task, memoryContext: memoryContext.selected, ...(body.input || {}) },
    prompt: groundedPrompt,
    media: body.media || null,
    request,
    qualityMode: body.qualityMode || 'balanced',
  });

  if (!result.ok) {
    return Response.json({ error: result.error, aiOs: result.aiOs || null }, { status: result.status || 400 });
  }

  const generated = result.result || {};
  return Response.json({
    result: {
      title: 'SnapNext AI Draft',
      summary: memoryContext.totalAvailable
        ? `Grounded in ${memoryContext.selected.length} relevant memories from your library.`
        : 'No saved media context was available yet, so this draft is general.',
      caption: generated?.text || generated?.reply || generated?.caption || JSON.stringify(generated?.ideas || generated),
      hashtags: generated?.hashtags ? [String(generated.hashtags)] : ['#snapnext', '#memories', '#digitalLife'],
      steps: ['Review the draft', 'Adjust the tone', 'Save or share'],
      draftType: 'Social Post',
      matchedMediaIds: memoryContext.selected.map((m) => m.id),
    },
    meta: result.meta,
    aiOs: result.aiOs,
  });
}
