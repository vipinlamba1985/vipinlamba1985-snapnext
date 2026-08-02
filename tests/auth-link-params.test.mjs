// Password reset and email verification links arrived looking broken.
//
// Supabase returns the recovery session in the URL *fragment*
// (#access_token=...&type=recovery). A fragment is never sent to the server and
// is invisible to useSearchParams, so a page reading only the query string sees
// nothing and reports "Missing reset link" for a perfectly valid link.
//
// Separately, /auth/callback forwards verification as `token_hash` while the
// verify page only accepted `token`, so anything arriving through the callback
// could never be verified.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

const PAGES = [
  ['reset password', path.join('app', 'reset-password', 'page.js')],
  ['verify email', path.join('app', 'verify-email', 'page.js')],
];

for (const [label, file] of PAGES) {
  test(`${label} reads the URL fragment, not just the query string`, async () => {
    const source = await read(file);
    assert.match(source, /window\.location\.hash/, `${label} must read the fragment`);
    assert.match(source, /new URLSearchParams\(raw\)/);
  });

  test(`${label} waits for the fragment before judging the link`, async () => {
    const source = await read(file);
    // Without this guard the first render always reports the link missing,
    // because the fragment has not been read yet.
    assert.match(source, /hashParams === null\) return/);
  });

  test(`${label} clears the tokens from the address bar once read`, async () => {
    const source = await read(file);
    assert.match(source, /history\.replaceState/, `${label} must not leave tokens in history`);
  });

  test(`${label} reports an expired link as expired, not missing`, async () => {
    const source = await read(file);
    // Supabase reports a dead link in the fragment rather than as an HTTP error.
    assert.match(source, /error_code/);
    assert.match(source, /expired/i);
  });
}

test('the verify page accepts the name the callback actually sends', async () => {
  const page = await read(path.join('app', 'verify-email', 'page.js'));
  const callback = await read(path.join('app', 'auth', 'callback', 'route.js'));

  // The callback sets token_hash; accepting only `token` broke every link
  // that passed through it.
  assert.match(callback, /verifyUrl\.searchParams\.set\('token_hash'/);
  assert.match(page, /params\.get\('token_hash'\)/);
  // The older `token` spelling still works for links generated elsewhere.
  assert.match(page, /params\.get\('token'\)/);
});

test('the reset page still accepts every shape Supabase can send', async () => {
  const page = await read(path.join('app', 'reset-password', 'page.js'));
  for (const key of ['token_hash', 'token', 'access_token', 'refresh_token']) {
    assert.ok(page.includes(`'${key}'`), `reset page no longer reads ${key}`);
  }
});
