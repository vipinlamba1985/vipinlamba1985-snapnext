export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { transcribeAudioWithBudget } from '@/lib/budgeted-direct-ai';
import { getUserAiWalletSnapshot } from '@/lib/ai-weekly-wallet';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to use SnapNext AI.' } }, { status: 401 });
  }

  const { mediaId } = await request.json().catch(() => ({}));
  if (!mediaId) return Response.json({ error: { code: 'invalid_request', message: 'mediaId is required.' } }, { status: 400 });

  const db = await getDb();
  const doc = await db.collection('media').findOne({ id: mediaId, userId: user.id });
  if (!doc) return Response.json({ error: { code: 'not_found', message: 'Media not found.' } }, { status: 404 });

  try {
    const buffer = await storage.read({ provider: doc.provider || 'local', storageKey: doc.storageKey });
    const budgeted = await transcribeAudioWithBudget({ db, user, request, buffer, mimeType: doc.mime || '' });

    if (!budgeted.ok) {
      return Response.json({
        error: { code: budgeted.error.code, message: budgeted.error.message },
        weeklyWallet: budgeted.gate?.wallet || null,
        profitGuard: budgeted.gate?.profitGuard || null,
      }, { status: budgeted.error.status });
    }

    const text = budgeted.result;
    await db.collection('media').updateOne({ id: mediaId, userId: user.id }, { $set: { 'aiAnalysis.transcript': text } });
    const weeklyWallet = await getUserAiWalletSnapshot({ db, user, request });

    return Response.json({
      transcript: text,
      meta: {
        estimatedCostUsd: budgeted.estimatedCostUsd,
        weeklyAiWallet: weeklyWallet,
        profitGuardApproved: true,
      },
    });
  } catch (error) {
    console.error('[transcription] error:', error?.message);
    const code = error?.code === 'ai_service_unavailable' ? 'ai_service_unavailable' : 'transcription_failed';
    const status = code === 'ai_service_unavailable' ? 503 : 502;
    return Response.json({
      error: {
        code,
        message: code === 'ai_service_unavailable'
          ? 'Audio transcription is not available yet. The AI service is not configured.'
          : 'We could not transcribe this audio right now. Please try again.',
        retryable: code !== 'ai_service_unavailable',
      },
    }, { status });
  }
}
