export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { analyzeMediaOnce } from '@/lib/cached-media-analysis';

const RETRYABLE_STATUSES = [
  'pending',
  'analysis_failed',
  'ai_timeout',
  'provider_rate_limited',
  'provider_unavailable',
  'internal_error',
];

function retryableQuery(userId) {
  const staleProcessing = new Date(Date.now() - 5 * 60 * 1000);
  return {
    userId,
    trashed: { $ne: true },
    $or: [
      { aiAnalysisStatus: { $in: RETRYABLE_STATUSES } },
      { aiAnalysisStatus: 'processing', aiAnalysisStartedAt: { $lt: staleProcessing } },
    ],
  };
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const [pending, processing, completed, failed] = await Promise.all([
    db.collection('media').countDocuments({ userId: user.id, aiAnalysisStatus: 'pending', trashed: { $ne: true } }),
    db.collection('media').countDocuments({ userId: user.id, aiAnalysisStatus: 'processing', trashed: { $ne: true } }),
    db.collection('media').countDocuments({ userId: user.id, aiAnalysisStatus: { $in: ['completed', 'completed_cached'] }, trashed: { $ne: true } }),
    db.collection('media').countDocuments({ userId: user.id, aiAnalysisStatus: { $in: RETRYABLE_STATUSES.filter((s) => s !== 'pending') }, trashed: { $ne: true } }),
  ]);

  return Response.json({ pending, processing, completed, failed });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const candidates = await db.collection('media')
    .find(retryableQuery(user.id))
    .sort({ aiAnalysisQueuedAt: 1, createdAt: 1 })
    .limit(2)
    .toArray();

  let processed = 0;
  let completed = 0;
  let failed = 0;

  for (const item of candidates) {
    const claim = await db.collection('media').updateOne(
      { id: item.id, userId: user.id, aiAnalysisStatus: item.aiAnalysisStatus },
      {
        $set: { aiAnalysisStatus: 'processing', aiAnalysisStartedAt: new Date() },
        $inc: { aiAnalysisAttempts: 1 },
      },
    );
    if (!claim.modifiedCount) continue;

    processed += 1;
    try {
      const buffer = await storage.read({ provider: item.provider || 'local', storageKey: item.storageKey });
      const budgeted = await analyzeMediaOnce({
        db,
        user,
        request: null,
        buffer,
        name: item.name || '',
        mimeType: item.mime || '',
        kind: item.kind || 'photo',
        source: 'recovery',
      });

      if (budgeted.ok) {
        await db.collection('media').updateOne(
          { id: item.id, userId: user.id },
          {
            $set: {
              aiAnalysis: budgeted.result,
              aiAnalysisCached: Boolean(budgeted.cached),
              aiAnalysisStatus: budgeted.cached ? 'completed_cached' : 'completed',
              aiAnalysisCompletedAt: new Date(),
            },
            $unset: { aiAnalysisLastError: '' },
          },
        );
        completed += 1;
      } else {
        const code = budgeted.error?.code || 'budget_blocked';
        await db.collection('media').updateOne(
          { id: item.id, userId: user.id },
          { $set: { aiAnalysisStatus: code, aiAnalysisLastError: code, aiAnalysisCompletedAt: new Date() } },
        );
        failed += 1;
      }
    } catch (error) {
      const code = error?.code || 'analysis_failed';
      await db.collection('media').updateOne(
        { id: item.id, userId: user.id },
        { $set: { aiAnalysisStatus: code, aiAnalysisLastError: code, aiAnalysisCompletedAt: new Date() } },
      ).catch(() => {});
      failed += 1;
    }
  }

  return Response.json({ processed, completed, failed });
}
