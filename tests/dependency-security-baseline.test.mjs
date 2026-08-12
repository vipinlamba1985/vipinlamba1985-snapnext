import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async relative => JSON.parse(await readFile(path.join(repoRoot, relative), 'utf8'));

function tuple(version) {
  return String(version || '').split('.').slice(0, 3).map(part => Number.parseInt(part, 10) || 0);
}

function atLeast(version, minimum) {
  const left = tuple(version);
  const right = tuple(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }
  return true;
}

function packageEntries(lock, packageName) {
  return Object.entries(lock.packages || {}).filter(([location]) => location === `node_modules/${packageName}` || location.endsWith(`/node_modules/${packageName}`));
}

test('SnapNext stays on the patched stable Next 16 line without a prerelease force-upgrade', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.dependencies.next, '16.2.12');
  assert.equal(pkg.devDependencies['eslint-config-next'], '16.2.12');
  assert.doesNotMatch(pkg.dependencies.next, /(canary|preview|rc|beta)/i);
});

test('Next build internals are pinned to the security-fixed versions already used by the forward Next line', async () => {
  const pkg = await readJson('package.json');
  const lock = await readJson('package-lock.json');

  assert.equal(pkg.overrides?.next?.postcss, '8.5.23');
  assert.equal(pkg.overrides?.sharp, '$sharp');

  const nextPostcss = lock.packages?.['node_modules/next/node_modules/postcss'];
  assert.ok(nextPostcss, 'Next must keep an explicit patched PostCSS resolution');
  assert.ok(atLeast(nextPostcss.version, '8.5.23'), `Next PostCSS ${nextPostcss.version} re-enters the vulnerable range`);

  const sharpEntries = packageEntries(lock, 'sharp');
  assert.ok(sharpEntries.length > 0, 'Sharp must remain installed for thumbnail/image processing');
  for (const [location, metadata] of sharpEntries) {
    assert.ok(atLeast(metadata.version, '0.35.0'), `${location} uses vulnerable Sharp ${metadata.version}`);
  }
  assert.equal(lock.packages?.['node_modules/next/node_modules/sharp'], undefined, 'Next must reuse the patched Sharp line instead of restoring a vulnerable nested copy');
});

test('the lockfile does not reintroduce the brace-expansion high-severity ranges', async () => {
  const lock = await readJson('package-lock.json');
  const entries = packageEntries(lock, 'brace-expansion');
  assert.ok(entries.length > 0);

  for (const [location, metadata] of entries) {
    const [major, minor, patch] = tuple(metadata.version);
    const vulnerable = (major === 1 && minor === 1 && patch <= 17)
      || major === 3
      || major === 4
      || (major === 5 && minor === 0 && patch <= 8);
    assert.equal(vulnerable, false, `${location} reintroduced vulnerable brace-expansion ${metadata.version}`);
  }
});

test('the lockfile keeps js-yaml beyond the audited high-severity range', async () => {
  const lock = await readJson('package-lock.json');
  for (const [location, metadata] of packageEntries(lock, 'js-yaml')) {
    assert.ok(atLeast(metadata.version, '4.3.1'), `${location} reintroduced vulnerable js-yaml ${metadata.version}`);
  }
});
