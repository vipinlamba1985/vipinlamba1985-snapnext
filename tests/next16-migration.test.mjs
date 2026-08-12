import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(repoRoot, relative), 'utf8');

async function exists(relative) {
  try {
    await access(path.join(repoRoot, relative));
    return true;
  } catch {
    return false;
  }
}

test('framework packages stay on the approved Next 16 / React 19 line', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.dependencies.next, '16.2.12');
  assert.equal(pkg.dependencies.react, '19.2.7');
  assert.equal(pkg.dependencies['react-dom'], '19.2.7');
  assert.equal(pkg.devDependencies['eslint-config-next'], '16.2.12');
});

test('the production build keeps repository tests, typecheck and lint as hard gates', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const build = pkg.scripts.build;
  assert.match(build, /npm test/);
  assert.match(build, /npm run typecheck/);
  assert.match(build, /npm run lint/);
  assert.match(build, /next build --webpack/);
});

test('Webpack is explicit while the custom webpack configuration remains', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const config = await read('next.config.js');
  assert.match(config, /webpack\(config, \{ dev \}\)/);
  assert.match(pkg.scripts.dev, /next dev --webpack/);
  assert.match(pkg.scripts['dev:no-reload'], /next dev --webpack/);
  assert.match(pkg.scripts['dev:webpack'], /next dev --webpack/);
});

test('Next 16 uses proxy.js and no deprecated middleware file', async () => {
  assert.equal(await exists('middleware.js'), false);
  assert.equal(await exists('proxy.js'), true);
  const proxy = await read('proxy.js');
  assert.match(proxy, /export async function proxy\(request\)/);
  assert.doesNotMatch(proxy, /export async function middleware\(/);
  assert.match(proxy, /api_origin_rejected/);
  assert.match(proxy, /api_rate_limited/);
  assert.match(proxy, /preview-demo-token/);
});

test('Next config contains no removed eslint option', async () => {
  const config = await read('next.config.js');
  assert.doesNotMatch(config, /eslint\s*:\s*\{/);
  assert.match(config, /ignoreBuildErrors:\s*false/);
});

test('ESLint treats proxy.js as server-side code', async () => {
  const config = await read('eslint.config.mjs');
  assert.match(config, /'proxy\.js'/);
  assert.doesNotMatch(config, /'middleware\.js'/);
});
