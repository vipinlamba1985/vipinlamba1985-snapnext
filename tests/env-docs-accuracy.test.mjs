// The environment docs listed SMART_SYNC_TOKEN_ENCRYPTION_KEY as required for
// cloud sync. No code has ever read it — the real secret is
// CLOUD_CONNECTOR_SECRET. A documented variable that does nothing sends whoever
// is configuring the deployment after a value that cannot help, and hides the
// one that matters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every env var name the code mentions at all.
 *
 * Not just `process.env.X`: providers are read through `process.env[adapter.
 * clientIdEnv]` and the email senders take an `env` object, so the name appears
 * as a bare string. Matching the token anywhere is the check that does not
 * produce false alarms for those.
 */
function referencedInCode() {
  const out = execFileSync('grep', [
    '-rhoE', '\\b[A-Z][A-Z0-9_]{4,}\\b', 'lib', 'app', 'scripts', 'middleware.js',
  ], { cwd: repoRoot, encoding: 'utf8' });
  return new Set(out.split('\n').map((line) => line.trim()).filter(Boolean));
}

/** Variable names a doc presents in backticks as configuration. */
async function documentedIn(file) {
  const text = await readFile(path.join(repoRoot, file), 'utf8');
  return [...text.matchAll(/`([A-Z][A-Z0-9_]{4,})`/g)].map((match) => match[1]);
}

const DOCS = ['docs/ENV_REQUIRED.md', 'docs/ENV_SETUP_ORDER.md'];

// Names that are values or placeholders rather than variables the app reads.
const NOT_VARIABLES = new Set([
  'REQUIRED', 'OPTIONAL', 'PRODUCTION', 'DEVELOPMENT', 'STORAGE',
  'NEXT_PUBLIC_', // a prefix being explained, not a variable
]);

for (const file of DOCS) {
  test(`${file} documents no variable the code never reads`, async () => {
    const code = referencedInCode();
    const phantom = (await documentedIn(file))
      .filter((name) => !NOT_VARIABLES.has(name))
      .filter((name) => !code.has(name));

    assert.deepEqual(
      [...new Set(phantom)],
      [],
      'these are documented but never read by any code',
    );
  });
}

test('the secret cloud sync actually uses is documented', async () => {
  for (const file of DOCS) {
    const text = await readFile(path.join(repoRoot, file), 'utf8');
    assert.match(text, /CLOUD_CONNECTOR_SECRET/, `${file} must name the secret that is really used`);
  }
  // And it is genuinely the one encrypting stored tokens.
  const crypto = await readFile(path.join(repoRoot, 'lib', 'cloud-token-crypto.js'), 'utf8');
  assert.match(crypto, /CLOUD_CONNECTOR_SECRET/);
});

test('every provider in the registry declares only real variables', async () => {
  const { SMART_SYNC_PROVIDERS } = await import('../lib/smart-sync/providers.js');
  const code = referencedInCode();
  for (const provider of Object.values(SMART_SYNC_PROVIDERS)) {
    for (const key of provider.env) {
      assert.ok(code.has(key), `${provider.id} declares ${key}, which no code reads`);
    }
  }
});
