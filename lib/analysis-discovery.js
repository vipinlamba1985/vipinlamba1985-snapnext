import { enqueueAssetAnalysis } from '@/lib/analysis-queue';

export async function discoverRecentAssets({ db, userId, limit = 20 }) {
  if (!db || !userId) return { scanned: 0, results: [] };
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const media = await db.collection('media')
    .find({ userId, trashed: { $ne: true }, kind: { $in: ['photo', 'video', 'text'] } })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .toArray();

  const results = [];
  for (const item of media) {
    results.push(await enqueueAssetAnalysis({
      db,
      media: item,
      reason: 'recent_asset_discovery',
      priority: 40,
    }));
  }

  return { scanned: media.length, results };
}
