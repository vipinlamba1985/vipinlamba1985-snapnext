// Guards on what smart search is allowed to spend.
//
// The risk this file exists to prevent: a paid model call that happens because
// the app decided to, rather than because a person asked for it. Ordinary
// searching must stay free, and the same phrase must never be paid for twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

test('ordinary library search never calls a paid model', async () => {
  const media = await read(path.join('app', 'api', 'media', 'route.js'));
  const service = await read(path.join('lib', 'media-library-service.js'));
  for (const [name, source] of [['media route', media], ['library service', service]]) {
    assert.doesNotMatch(source, /search-embeddings\.server/, `${name} must not reach the embedding provider`);
    assert.doesNotMatch(source, /embedQuery|embedTexts/, `${name} must stay free`);
  }
});

test('searching by meaning requires an explicit opt-in', async () => {
  const route = await read(path.join('app', 'api', 'ai-index', 'search', 'route.js'));
  // Anything other than an explicit `smart=true` must leave spending switched
  // off. An earlier version defaulted this on, which would have charged for
  // every search made through the endpoint.
  assert.match(route, /smart'\) === 'true'/);
  assert.doesNotMatch(route, /smart'\) !== 'false'/, 'smart search must be opt-in, not opt-out');
});

test('the meaning search is behind a deliberate tap, not automatic', async () => {
  const page = await read(path.join('app', '(app)', 'gallery', 'page.js'));

  assert.match(page, /data-testid="library-search-by-meaning"/);
  assert.match(page, /onClick=\{searchByMeaning\}/, 'it must be driven by a click');
  // The plain, free search and server-backed collection filter are what run on
  // load. Scroll restoration may add setup inside this effect, but it must still
  // end by loading the free paged endpoint and remain scoped to collection/search.
  assert.match(page, /useEffect\(\(\) => \{[\s\S]*?\bload\(\);[\s\S]*?\}, \[collection, search\]\)/);
  assert.doesNotMatch(page, /useEffect[\s\S]*?searchByMeaning\(\)[\s\S]*?\}, \[[^\]]*\]\)/, 'meaning search must never run from an effect');

  const loadStart = page.indexOf('async function load(');
  const meaningStart = page.indexOf('async function searchByMeaning()');
  assert.ok(loadStart >= 0 && meaningStart > loadStart, 'the free load path must remain separate from meaning search');
  const freeLoadPath = page.slice(loadStart, meaningStart);
  assert.doesNotMatch(freeLoadPath, /smart=true|ai-index\/search/, 'ordinary Library loading must never trigger paid meaning search');

  // Offered only when the free search already came up short.
  assert.match(page, /visibleItems\.length < 5/);
});

test('a repeated search phrase is not charged twice', async () => {
  const source = await read(path.join('lib', 'search-embeddings.server.js'));
  assert.match(source, /search_query_embeddings/);
  // The cache must be consulted before any reservation is made.
  assert.ok(
    source.indexOf('findOne({ _id: key })') < source.indexOf('feature: \'smart_search_query\''),
    'the cache must be checked before spending',
  );
  assert.match(source, /costUsd: 0, cached: true/, 'a cache hit must report no cost');
});

test('cached queries store a hash, never what was typed', async () => {
  const source = await read(path.join('lib', 'search-embeddings.server.js'));
  assert.match(source, /createHash\('sha256'\)/);
  // The cache is shared across users, so the raw phrase must not be persisted.
  const write = source.slice(source.indexOf('search_query_embeddings'));
  assert.doesNotMatch(write.slice(0, 600), /\btext\b\s*[,:}]/, 'the search phrase must not be stored');
});

test('indexing stays in bounded batches rather than one unattended run', async () => {
  const route = await read(path.join('app', 'api', 'ai-index', 'embeddings', 'route.js'));
  assert.match(route, /const MAX_BATCH = \d+/);
  assert.match(route, /Math\.min\(MAX_BATCH/);
  // Nothing may schedule itself.
  assert.doesNotMatch(route, /setInterval|setTimeout|while \(true\)/);
});

test('a failed provider call gives the money back', async () => {
  const source = await read(path.join('lib', 'search-embeddings.server.js'));
  const failurePath = source.slice(source.indexOf('} catch (error) {'));
  assert.match(failurePath, /releaseExternalAiSpend/);
});
