// The sidebar must remain reachable on short windows and phones even though
// Frozen Navigation v1 keeps More intentionally small and control-focused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shell = () => readFile(path.join(repoRoot, 'components', 'AppShell.js'), 'utf8');

test('the navigation list can scroll', async () => {
  const source = await shell();
  const nav = source.slice(source.indexOf('data-testid="sidebar-nav"'));
  const opening = nav.slice(0, nav.indexOf('>'));
  assert.match(opening, /overflow-y-auto/);
  assert.match(opening, /flex-1/);
});

test('the sidebar is a column so the nav has a height to fill', async () => {
  const source = await shell();
  const aside = source.slice(source.indexOf('<aside'), source.indexOf('</aside>'));
  const opening = aside.slice(0, aside.indexOf('>'));
  assert.match(opening, /flex-col/);
  assert.match(opening, /h-full/);
  assert.match(opening, /md:h-screen/);
});

test('the last More control is not hidden behind the phone home indicator', async () => {
  const source = await shell();
  const nav = source.slice(source.indexOf('data-testid="sidebar-nav"'));
  assert.match(nav.slice(0, nav.indexOf('>')), /safe-area-inset-bottom/);
});

test('every frozen secondary control is listed in More', async () => {
  const source = await shell();
  const match = source.match(/const MORE_HREFS = \[([\s\S]*?)\]/);
  assert.ok(match, 'MORE_HREFS could not be found');
  for (const href of ['/profile', '/settings', '/plan-storage', '/privacy-security', '/integrations', '/support']) {
    assert.ok(match[1].includes(`'${href}'`), `${href} is missing from More`);
  }
  for (const oldFeatureDestination of ['/trash', '/downloads', '/memories', '/smart-sync']) {
    assert.ok(!match[1].includes(`'${oldFeatureDestination}'`), `${oldFeatureDestination} must not be promoted into More under frozen v1`);
  }
});
