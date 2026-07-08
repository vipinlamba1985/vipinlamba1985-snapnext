export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { runAiTask } from '@/lib/ai-router';
import { textToSpeechWithBudget } from '@/lib/budgeted-direct-ai';

function readAiResult(result, key) {
  return result?.result?.[key] ?? result?.result ?? null;
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, { status: 401 });
  }

  const { query, voiceResponse = false } = await request.json().catch(() => ({}));
  if (!query) return Response.json({ error: { code: 'invalid_request', message: 'Query is required.' } }, { status: 400 });

  const db = await getDb();
  const mediaList = await db.collection('media')
    .find({ userId: user.id, trashed: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  const libraryContext = mediaList.map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    tags: item.aiAnalysis?.tags || [],
    faces: item.aiAnalysis?.faces || [],
    locations: item.aiAnalysis?.locations || [],
    autoAlbum: item.aiAnalysis?.autoAlbum || '',
    description: item.aiAnalysis?.description || '',
  }));

  const result = await runAiTask({
    db,
    user,
    feature: 'chat',
    input: { query },
    prompt: `User: ${query}\nLibrary context JSON: ${JSON.stringify(libraryContext).slice(0, 8000)}`,
    request,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status || 400 });
  }

  const reply = readAiResult(result, 'reply');
  let audio = null;
  let voiceMeta = null;

  if (voiceResponse) {
    try {
      const voice = await textToSpeechWithBudget({ db, user, request, text: reply });
      if (voice.ok) {
        audio = voice.result;
        voiceMeta = { estimatedCostUsd: voice.estimatedCostUsd, profitGuardApproved: true };
      } else {
        voiceMeta = {
          blocked: true,
          code: voice.error.code,
          message: voice.error.message,
          weeklyWallet: voice.gate?.wallet || null,
        };
      }
    } catch (error) {
      console.error('[voice-tts] failed:', error?.message);
      voiceMeta = { error: error?.code || 'voice_tts_failed' };
    }
  }

  return Response.json({ reply, audio, meta: result.meta, voiceMeta });
}
