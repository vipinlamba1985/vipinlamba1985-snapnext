// Rate limiting falls back to per-instance memory when it cannot find Redis,
// which on serverless means the effective limit is multiplied by however many
// instances are running. A correctly provisioned database being missed because
// the hosting integration named the variables differently is therefore a silent
// failure, not a loud one — so credential discovery is tested directly.
import test from 'node:test';
import assert from 'node:assert/strict';

import { findRedisRestCredentials } from '../lib/distributed-rate-limit.js';

test('the documented names are found', () => {
  assert.deepEqual(
    findRedisRestCredentials({
      UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'tok',
    }),
    { url: 'https://x.upstash.io', token: 'tok' },
  );
});

test("Vercel's own integration naming is found", () => {
  assert.deepEqual(
    findRedisRestCredentials({ KV_REST_API_URL: 'https://x.upstash.io', KV_REST_API_TOKEN: 'tok' }),
    { url: 'https://x.upstash.io', token: 'tok' },
  );
});

test('a custom integration prefix is found', () => {
  // Choosing "STORAGE" in the Vercel connect dialog produces these.
  assert.deepEqual(
    findRedisRestCredentials({ STORAGE_REST_API_URL: 'https://x.upstash.io', STORAGE_REST_API_TOKEN: 'tok' }),
    { url: 'https://x.upstash.io', token: 'tok' },
  );
  assert.deepEqual(
    findRedisRestCredentials({ CACHE_REST_URL: 'https://y.upstash.io', CACHE_REST_TOKEN: 'tok2' }),
    { url: 'https://y.upstash.io', token: 'tok2' },
  );
});

test('the documented names win when several are present', () => {
  const found = findRedisRestCredentials({
    STORAGE_REST_API_URL: 'https://custom.upstash.io',
    STORAGE_REST_API_TOKEN: 'custom',
    UPSTASH_REDIS_REST_URL: 'https://documented.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'documented',
  });
  assert.equal(found.url, 'https://documented.upstash.io');
});

test('a half-configured pair is never used', () => {
  // A URL with no token would fail every request; falling back to memory is
  // the correct outcome rather than erroring on each call.
  assert.equal(findRedisRestCredentials({ UPSTASH_REDIS_REST_URL: 'https://x.upstash.io' }), null);
  assert.equal(findRedisRestCredentials({ STORAGE_REST_API_URL: 'https://x.upstash.io' }), null);
  assert.equal(findRedisRestCredentials({}), null);
});

test('a redis:// connection string is not mistaken for a REST endpoint', () => {
  // The integration injects both; only the REST pair can serve /pipeline.
  const found = findRedisRestCredentials({
    STORAGE_URL: 'redis://default:pass@x.upstash.io:6379',
    STORAGE_REST_API_URL: 'https://x.upstash.io',
    STORAGE_REST_API_TOKEN: 'tok',
  });
  assert.match(found.url, /^https:\/\//);
});
