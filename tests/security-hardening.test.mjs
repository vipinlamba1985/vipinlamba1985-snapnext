import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const middleware = fs.readFileSync(new URL('../middleware.js', import.meta.url), 'utf8');
const nextConfig = fs.readFileSync(new URL('../next.config.js', import.meta.url), 'utf8');
const limiter = fs.readFileSync(new URL('../lib/distributed-rate-limit.js', import.meta.url), 'utf8');

test('production CSP is nonce based and excludes unsafe-eval', () => {
  assert.match(middleware, /'nonce-\$\{nonce\}'/);
  assert.match(middleware, /'strict-dynamic'/);
  assert.match(middleware, /process\.env\.NODE_ENV === 'development'/);
  assert.doesNotMatch(nextConfig, /unsafe-eval/);
  assert.doesNotMatch(nextConfig, /Content-Security-Policy/);
});

test('rate limiter supports shared Upstash storage', () => {
  assert.match(limiter, /UPSTASH_REDIS_REST_URL/);
  assert.match(limiter, /UPSTASH_REDIS_REST_TOKEN/);
  assert.match(limiter, /\/pipeline/);
});

test('allowed origins are environment driven', () => {
  assert.match(middleware, /process\.env\.CORS_ORIGINS/);
  assert.doesNotMatch(middleware, /https:\/\/snapnext\.ai/);
});
