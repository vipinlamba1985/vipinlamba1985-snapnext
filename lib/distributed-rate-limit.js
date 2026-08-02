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

/**
 * Finds the Redis REST credentials whatever they were named.
 *
 * Hosting integrations inject these under their own prefix — Vercel's Upstash
 * integration uses `KV_REST_API_*`, and a custom prefix produces things like
 * `STORAGE_REST_API_*`. Requiring one exact spelling meant a correctly
 * provisioned database could sit unused while rate limiting silently ran on
 * per-instance memory, which is the failure this whole module exists to avoid.
 *
 * A URL only counts when its matching token is present, so a half-configured
 * pair is never used.
 */
export function findRedisRestCredentials(env = process.env) {
  const pairs = [
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  ];

  for (const [urlKey, tokenKey] of pairs) {
    if (env[urlKey] && env[tokenKey]) return { url: env[urlKey], token: env[tokenKey] };
  }

  // Anything injected under a custom prefix, e.g. STORAGE_REST_API_URL.
  for (const key of Object.keys(env)) {
    const suffix = ['_REST_API_URL', '_REST_URL'].find((value) => key.endsWith(value));
    if (!suffix) continue;
    const token = env[`${key.slice(0, -suffix.length)}${suffix.replace('_URL', '_TOKEN')}`];
    if (env[key] && token) return { url: env[key], token };
  }

  return null;
}

async function upstashLimit(key, limit, windowMs) {
  const credentials = findRedisRestCredentials();
  if (!credentials) return null;
  const { url, token } = credentials;

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
