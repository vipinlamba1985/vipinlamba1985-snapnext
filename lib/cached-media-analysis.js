import { analyzeMediaWithBudget } from '@/lib/budgeted-direct-ai';
import { buildAiCacheKey, readAiResultCache, sha256, writeAiResultCache } from '@/lib/ai-result-cache';

export async function analyzeMediaOnce(args) {
  const { db, user, buffer, kind = 'photo', mimeType = '' } = args;
  const contentHash = buffer?.length ? sha256(buffer) : null;
  const feature = kind === 'video' ? 'upload_video_analysis' : 'upload_image_analysis';
  const cacheKey = contentHash ? buildAiCacheKey({ userId: user.id, feature, contentHash, options: { kind, mimeType } }) : null;

  if (cacheKey) {
    const cached = await readAiResultCache({ db, cacheKey });
    if (cached != null) return { ok: true, result: cached, cached: true, estimatedCostUsd: 0 };
  }

  const response = await analyzeMediaWithBudget(args);
  if (response.ok && cacheKey) {
    await writeAiResultCache({ db, cacheKey, userId: user.id, feature, contentHash, provider: 'gemini', result: response.result }).catch(() => {});
  }
  return { ...response, cached: false };
}
