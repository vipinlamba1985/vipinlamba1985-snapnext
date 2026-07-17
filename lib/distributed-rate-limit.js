const localBuckets = globalThis.__snapnextRateBuckets || new Map();
globalThis.__snapnextRateBuckets = localBuckets;

function localLimit(key, limit, windowMs) {
  const now = Date.now();
  const current = localBuckets.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    localBuckets.set(key, next);
    return { allowed: true, limit, remaining: limit - 1, resetAt: next.resetAt, backend: 'memory' };
  }
  current.count += 1;
  return {
    allowed: current.count <= limit,
    limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
    backend: 'memory',
  };
}

async function upstashLimit(key, limit, windowMs) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const bucket = `snapnext:rate:${key}:${Math.floor(Date.now() / windowMs)}`;
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['INCR', bucket], ['EXPIRE', bucket, ttlSeconds, 'NX'], ['TTL', bucket]]),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Rate-limit backend returned ${response.status}`);
  const result = await response.json();
  const count = Number(result?.[0]?.result || 0);
  const ttl = Math.max(1, Number(result?.[2]?.result || ttlSeconds));
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: Date.now() + ttl * 1000,
    backend: 'upstash',
  };
}

export async function distributedRateLimit({ key, limit, windowMs }) {
  try {
    const distributed = await upstashLimit(key, limit, windowMs);
    if (distributed) return distributed;
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'rate_limit_backend_failed',
      failureCategory: error?.name || 'Error',
    }));
  }
  return localLimit(key, limit, windowMs);
}
