// Primary navigation was contradictory three ways: CONTRIBUTING.md mandated one
// set of names, the app shipped another, and a third was under discussion. The
// shipped names won. This test checks the code and every document that states
// the rule against each other, so the decision is settled rather than merely
// written down, and a feature PR cannot quietly reopen it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

// The settled decision. Changing navigation means changing this list, in its own
// commit, with its own reasoning.
const PRIMARY_NAV = [
  { href: '/dashboard', label: 'Home' },
  { href: '/gallery', label: 'Library' },
  { href: '/upload', label: 'Add' },
  { href: '/ai-studio', label: 'Create' },
  { href: '/settings', label: 'You' },
];

// Names from the superseded proposal. If one reappears as a primary nav label,
// somebody is halfway through reopening a closed decision.
const SUPERSEDED_LABELS = ['Vault', 'Stories', 'People'];

async function appShell() {
  return read(path.join('components', 'AppShell.js'));
}

function parsePrimaryHrefs(source) {
  const match = source.match(/const PRIMARY_HREFS = \[([^\]]*)\]/);
  assert.ok(match, 'PRIMARY_HREFS could not be found in AppShell.js');
  return [...match[1].matchAll(/'([^']+)'/g)].map(entry => entry[1]);
}

function labelForHref(source, href) {
  const route = source.match(new RegExp(`\\{ href: '${href}', label: '([^']+)'`));
  return route ? route[1] : null;
}

test('the app ships exactly the five agreed primary destinations, in order', async () => {
  const source = await appShell();
  const hrefs = parsePrimaryHrefs(source);

  assert.equal(hrefs.length, 5, 'primary navigation is exactly five items — new destinations go under More');
  assert.deepEqual(hrefs, PRIMARY_NAV.map(item => item.href));
});

test('each primary destination carries its agreed label', async () => {
  const source = await appShell();
  for (const { href, label } of PRIMARY_NAV) {
    assert.equal(labelForHref(source, href), label, `${href} should be labelled "${label}"`);
  }
});

test('superseded navigation names have not crept back into the primary five', async () => {
  const source = await appShell();
  const labels = parsePrimaryHrefs(source).map(href => labelForHref(source, href));
  for (const stale of SUPERSEDED_LABELS) {
    assert.ok(!labels.includes(stale), `"${stale}" is from the superseded nav proposal`);
  }
});

test('every document stating the rule agrees with the code', async () => {
  const documents = ['CLAUDE.md', 'CONTRIBUTING.md', 'SNAPNEXT_BLUEPRINT_V4.md'];
  const shipped = PRIMARY_NAV.map(item => item.label);

  for (const file of documents) {
    const source = await read(file);
    for (const label of shipped) {
      assert.ok(
        new RegExp(`\\b${label}\\b`).test(source),
        `${file} states the navigation rule but omits "${label}"`,
      );
    }
    // The old set may be mentioned as history, but never as the current rule.
    assert.doesNotMatch(
      source,
      /navigation[^.]{0,80}\bVault\b/i,
      `${file} still presents the superseded nav as current`,
    );
  }
});

test('the blueprint records navigation as a settled decision', async () => {
  const blueprint = await read('SNAPNEXT_BLUEPRINT_V4.md');
  assert.match(blueprint, /### Navigation — settled/);
  // The reason has to survive, not just the conclusion — otherwise it gets
  // relitigated by someone who never saw the argument.
  assert.match(blueprint, /contradictory three ways/);
  assert.match(blueprint, /tests\/primary-navigation\.test\.mjs/);
});
