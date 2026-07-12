import crypto from 'crypto';

const DEFAULT_VERSION = 'v1';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''));
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function buildAiCacheKey({ userId, feature, contentHash, version = DEFAULT_VERSION, options = {} }) {
  if (!userId || !feature || !contentHash) return null;
  return sha256(stableStringify({ userId, feature, contentHash, version, options }));
}

export async function readAiResultCache({ db, cacheKey }) {
  if (!db || !cacheKey) return null;
  const row = await db.collection('ai_result_cache').findOne({ cacheKey, status: 'ready' });
  if (!row) return null;

  await db.collection('ai_result_cache').updateOne(
    { cacheKey },
    { $inc: { hitCount: 1 }, $set: { lastHitAt: new Date(), updatedAt: new Date() } },
  ).catch(() => {});

  return row.result;
}

export async function writeAiResultCache({ db, cacheKey, userId, feature, contentHash, version = DEFAULT_VERSION, provider, model, result }) {
  if (!db || !cacheKey || !userId || !feature || !contentHash || result == null) return;
  const now = new Date();
  await db.collection('ai_result_cache').updateOne(
    { cacheKey },
    {
      $set: {
        userId,
        feature,
        contentHash,
        version,
        provider: provider || null,
        model: model || null,
        result,
        status: 'ready',
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now, hitCount: 0 },
    },
    { upsert: true },
  );
}
