import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

const PRIMARY_NAV = [
  { href: '/dashboard', label: 'Home' },
  { href: '/gallery', label: 'Library' },
  { href: '/upload', label: 'Add' },
  { href: '/ai-studio', label: 'Create' },
  { href: '/circles', label: 'Circle' },
];

const MORE_NAV = [
  { href: '/profile', label: 'You / Profile' },
  { href: '/settings', label: 'Settings' },
  { href: '/plan-storage', label: 'Plan & storage' },
  { href: '/privacy-security', label: 'Privacy & security' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/support', label: 'Help & support' },
];

async function appShell() {
  return read(path.join('components', 'AppShell.js'));
}

function hrefsFromConst(source, name) {
  const match = source.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  assert.ok(match, `${name} could not be found in AppShell.js`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(entry => entry[1]);
}

function labelForHref(source, href) {
  const route = source.match(new RegExp(`\\{ href: '${href}', label: '([^']+)'`));
  return route ? route[1] : null;
}

test('frozen v1 ships exactly Home Library Add Create Circle in that order', async () => {
  const source = await appShell();
  const hrefs = hrefsFromConst(source, 'PRIMARY_HREFS');
  assert.equal(hrefs.length, 5, 'primary navigation must always contain exactly five destinations');
  assert.deepEqual(hrefs, PRIMARY_NAV.map(item => item.href));
  for (const { href, label } of PRIMARY_NAV) {
    assert.equal(labelForHref(source, href), label, `${href} must be labelled ${label}`);
  }
});

test('You/Profile is secondary, Create owns the fourth slot and Circle the fifth', async () => {
  const source = await appShell();
  const primary = hrefsFromConst(source, 'PRIMARY_HREFS');
  assert.equal(primary[3], '/ai-studio');
  assert.equal(primary[4], '/circles');
  assert.ok(!primary.includes('/settings'));
  assert.ok(!primary.includes('/profile'));
  assert.ok(!primary.includes('/support'));
  assert.ok(!primary.includes('/privacy-security'));
});

test('More contains the frozen secondary control surfaces and not feature destinations', async () => {
  const source = await appShell();
  const more = hrefsFromConst(source, 'MORE_HREFS');
  for (const { href, label } of MORE_NAV) {
    assert.ok(more.includes(href), `${label} must be reachable from More`);
    assert.equal(labelForHref(source, href), label);
  }
  for (const featureHref of ['/memories', '/smart-sync', '/event-director', '/circles', '/chat', '/journal', '/ready-to-post', '/ai-video', '/community']) {
    assert.ok(!more.includes(featureHref), `${featureHref} is a feature surface, not a More control`);
  }
});

test('mobile navigation is a fixed five-column bar and More stays top-left', async () => {
  const source = await appShell();
  assert.match(source, /data-testid="primary-mobile-nav"/);
  assert.match(source, /grid grid-cols-5/);
  assert.match(source, /aria-label="Open More menu"/);
  assert.doesNotMatch(source, /PRIMARY_HREFS[^;]*more/i);
});

test('primary destinations do not disappear because a feature flag is off', async () => {
  const source = await appShell();
  assert.match(source, /if \(PRIMARY_HREFS\.includes\(route\.href\)\) return true/);
});

test('the frozen navigation document is the authoritative contract', async () => {
  const doc = await read('docs/SNAPNEXT_NAVIGATION_V1_FROZEN.md');
  assert.match(doc, /SnapNext Navigation Architecture v1 — FROZEN/);
  assert.match(doc, /Discover → Find → Add → Make → Connect/);
  assert.match(doc, /Home, Library, \(\+\), Create, Circle/);
  assert.match(doc, /People is reserved for Circle/);
  assert.match(doc, /Service \/ authorization \/ infrastructure → More → Integrations/);
  assert.match(doc, /Exactly five primary destinations/);
});
