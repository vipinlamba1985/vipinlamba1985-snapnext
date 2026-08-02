// The sidebar was a fixed, full-height block with no overflow handling, so any
// navigation item past the bottom of the screen was unreachable — Trash,
// Billing and Support simply could not be clicked on a phone or a short window.
// Nothing errored; the links were just gone.
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

  assert.match(opening, /overflow-y-auto/, 'the nav must scroll its own overflow');
  assert.match(opening, /flex-1/, 'the nav must take the remaining height');
});

test('the sidebar is a column so the nav has a height to fill', async () => {
  const source = await shell();
  const aside = source.slice(source.indexOf('<aside'), source.indexOf('</aside>'));
  const opening = aside.slice(0, aside.indexOf('>'));

  // flex-1 only works inside a flex column with a bounded height.
  assert.match(opening, /flex-col/);
  assert.match(opening, /h-full/);
  assert.match(opening, /md:h-screen/);
});

test('the last item is not hidden behind the phone home indicator', async () => {
  const source = await shell();
  const nav = source.slice(source.indexOf('data-testid="sidebar-nav"'));
  assert.match(nav.slice(0, nav.indexOf('>')), /safe-area-inset-bottom/);
});

test('every secondary destination is still listed', async () => {
  const source = await shell();
  const match = source.match(/const MORE_HREFS = \[([\s\S]*?)\]/);
  assert.ok(match, 'MORE_HREFS could not be found');

  // These sit at the bottom of the list and were the ones users could not reach.
  for (const href of ['/trash', '/support', '/downloads']) {
    assert.ok(match[1].includes(`'${href}'`), `${href} is missing from the menu`);
  }
});
