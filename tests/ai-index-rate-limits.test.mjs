// Smart search endpoints spend money per call, so they must be rate limited.
//
// They were not: the general `ai` rule requires a slash directly after "ai",
// and these paths have a hyphen ("ai-index"), so every AI-index route fell
// through every rule. A phrase nobody has searched before cannot be served from
// the query cache, so an unlimited caller could mint unlimited paid embeddings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Rebuilds the middleware's rule list so the test checks the real patterns. */
async function rateRules() {
  const source = await readFile(path.join(repoRoot, 'middleware.js'), 'utf8');
  const block = source.slice(source.indexOf('const RATE_RULES = ['), source.indexOf('];', source.indexOf('const RATE_RULES = [')));
  const rules = [...block.matchAll(/match:\s*(\/.*?\/i),\s*limit:\s*(\d+),\s*windowMs:\s*([\d_]+)/g)];
  assert.ok(rules.length >= 5, 'could not parse the rate rules');
  return rules.map(([, pattern, limit, windowMs]) => {
    const body = pattern.slice(1, pattern.lastIndexOf('/'));
    return { regex: new RegExp(body, 'i'), limit: Number(limit), windowMs: Number(windowMs.replace(/_/g, '')) };
  });
}

const firstMatch = (rules, pathname) => rules.find(rule => rule.regex.test(pathname));

test('every spending AI-index route is rate limited', async () => {
  const rules = await rateRules();
  for (const pathname of ['/api/ai-index/search', '/api/ai-index/embeddings']) {
    const rule = firstMatch(rules, pathname);
    assert.ok(rule, `${pathname} is not rate limited — it can spend money on every call`);
    assert.ok(rule.limit > 0 && rule.limit <= 100, `${pathname} limit ${rule.limit} is too loose`);
  }
});

test('indexing is capped harder than searching', async () => {
  const rules = await rateRules();
  const search = firstMatch(rules, '/api/ai-index/search');
  const indexing = firstMatch(rules, '/api/ai-index/embeddings');

  // Per unit time, a batch of embeddings costs far more than one query.
  const searchPerMinute = search.limit / (search.windowMs / 60_000);
  const indexPerMinute = indexing.limit / (indexing.windowMs / 60_000);
  assert.ok(indexPerMinute < searchPerMinute, 'indexing must be the tighter limit');
});

test('ordinary library search is not caught by the AI limits', async () => {
  const rules = await rateRules();
  // /api/media is free and must stay as responsive as any other read.
  const rule = firstMatch(rules, '/api/media');
  assert.equal(rule, undefined, 'the free search path must not inherit an AI rate limit');
});
