// SNAPNEXT_BLUEPRINT_V4.md claims some principles are enforced by tests. This
// checks that those tests actually exist, and that the modules the blueprint
// calls import-free really are.
//
// Principle 10 applied to the blueprint itself: a document that outranks
// reality is worse than no document, so the document is tested too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLUEPRINT = 'SNAPNEXT_BLUEPRINT_V4.md';
const read = file => readFile(path.join(repoRoot, file), 'utf8');
const exists = async file => access(path.join(repoRoot, file)).then(() => true, () => false);

// Modules the blueprint promises cannot reach a provider (Principle 3).
const IMPORT_FREE_MODULES = [
  'lib/triage.js',
  'lib/trip-sharing.js',
  'lib/post-composer.js',
];

test('every test the blueprint cites actually exists', async () => {
  const blueprint = await read(BLUEPRINT);
  const cited = [...blueprint.matchAll(/`(tests\/[a-z0-9-]+\.test\.mjs)`/g)].map(match => match[1]);

  assert.ok(cited.length >= 4, `expected the blueprint to cite its enforcing tests, found ${cited.length}`);

  const missing = [];
  for (const file of new Set(cited)) {
    if (!await exists(file)) missing.push(file);
  }
  assert.deepEqual(missing, [], 'the blueprint cites tests that do not exist — fix the document or add the test');
});

test('the docs the blueprint points at exist', async () => {
  const blueprint = await read(BLUEPRINT);
  const cited = [...blueprint.matchAll(/`(docs\/[A-Za-z0-9_-]+\.md|CLAUDE\.md|CONTRIBUTING\.md)`/g)].map(m => m[1]);

  const missing = [];
  for (const file of new Set(cited)) {
    if (!await exists(file)) missing.push(file);
  }
  assert.deepEqual(missing, [], 'the blueprint links to documents that do not exist');
});

test('the import-free modules really are import-free', async () => {
  // The blueprint sells this as a structural guarantee rather than a promise,
  // so it has to hold literally.
  for (const file of IMPORT_FREE_MODULES) {
    const source = await read(file);
    assert.doesNotMatch(source, /^import /m, `${file} must stay import-free (Principle 3)`);
    assert.doesNotMatch(source, /require\(/, `${file} must stay import-free (Principle 3)`);
  }
});

test('the blueprint marks every claim with a status', async () => {
  const blueprint = await read(BLUEPRINT);
  for (const mark of ['✅', '🟢', '🧭', '⛔']) {
    assert.ok(blueprint.includes(mark), `the status legend promises ${mark} but it is never used`);
  }
  // The honesty rule is the point of the document; it must not be quietly cut.
  assert.match(blueprint, /## 0\. The Honesty Rule/);
  assert.match(blueprint, /Encode ideology in tests, not prose/);
});

test('the working docs point at the blueprint', async () => {
  // A constitution nobody is routed to is decoration.
  for (const file of ['CLAUDE.md', 'CONTRIBUTING.md']) {
    assert.match(await read(file), /SNAPNEXT_BLUEPRINT_V4\.md/, `${file} must link the blueprint`);
  }
});
