// A Google grant is judged by what it can reach, not by string equality with
// what was requested.
//
// Two failure modes this prevents. Google returns the scopes it actually
// granted, and with incremental authorisation an older wider grant can be
// carried into a new one — so trusting the requested scope would hide exactly
// the case the drive.file migration exists to remove. And a granted scope
// string varies in order and may legitimately include identity scopes, so exact
// comparison would reject valid grants and loop the user through reconnect
// forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FORBIDDEN_DRIVE_SCOPES,
  REQUIRED_DRIVE_SCOPE,
  grantNeedsRescope,
  inspectDriveGrant,
  parseScopes,
} from '../lib/google-drive-scope.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRIVE_ROUTE = path.join('app', 'api', 'cloud', 'google-drive', '[[...action]]', 'route.js');

test('the per-file scope alone is accepted', () => {
  assert.equal(inspectDriveGrant(REQUIRED_DRIVE_SCOPE).ok, true);
});

test('identity scopes alongside it are fine', () => {
  const grant = inspectDriveGrant(`openid email profile ${REQUIRED_DRIVE_SCOPE}`);
  assert.equal(grant.ok, true, 'Google may add identity scopes; that is not a mismatch');
});

test('order, spacing and duplicates do not matter', () => {
  const messy = `  ${REQUIRED_DRIVE_SCOPE}   openid\n${REQUIRED_DRIVE_SCOPE}  `;
  assert.equal(inspectDriveGrant(messy).ok, true);
  assert.equal(parseScopes(messy).length, 2, 'duplicates should collapse');
});

test('every restricted Drive scope is refused', () => {
  for (const scope of FORBIDDEN_DRIVE_SCOPES) {
    const grant = inspectDriveGrant(`${REQUIRED_DRIVE_SCOPE} ${scope}`);
    assert.equal(grant.ok, false, `${scope} must be refused even beside drive.file`);
    assert.equal(grant.reason, 'restricted_scope');
    assert.deepEqual(grant.forbidden, [scope]);
  }
});

test('a grant without the per-file scope is refused', () => {
  const grant = inspectDriveGrant('openid email');
  assert.equal(grant.ok, false);
  assert.equal(grant.reason, 'missing_required_scope');
});

test('an unknown scope is treated as unsafe, not as fine', () => {
  // Legacy records predate this field, and those are the ones most likely to
  // carry the wide grant.
  for (const value of [undefined, null, '', '   ']) {
    const grant = inspectDriveGrant(value);
    assert.equal(grant.ok, false, `${JSON.stringify(value)} must not pass`);
    assert.equal(grant.reason, 'unknown_scope');
    assert.equal(grantNeedsRescope(value), true);
  }
});

test('the callback stores what Google granted, not what was requested', async () => {
  const route = await readFile(path.join(repoRoot, DRIVE_ROUTE), 'utf8');
  assert.match(route, /inspectDriveGrant\(data\.scope\)/, 'the granted scope must be read from the token response');
  assert.match(route, /grantedScope: grant\.scopes\.join\(' '\)/);
  assert.doesNotMatch(route, /grantedScope: DRIVE_SCOPE/, 'storing the requested scope hides a wider grant');
});

test('a refused grant is handed back rather than simply not stored', async () => {
  const route = await readFile(path.join(repoRoot, DRIVE_ROUTE), 'utf8');
  const block = route.slice(route.indexOf('inspectDriveGrant(data.scope)'), route.indexOf('const set = {'));
  assert.match(block, /GOOGLE_REVOKE/, 'a rejected wide grant must be revoked, not left active at Google');
  assert.match(block, /cloudRedirect\(request, 'failed'\)/);
});

test('the browser token is gated on the grant, not on having connected once', async () => {
  const route = await readFile(path.join(repoRoot, DRIVE_ROUTE), 'utf8');
  const block = route.slice(route.indexOf("action === 'picker-token'"), route.indexOf("action === 'files'"));
  assert.match(block, /inspectDriveGrant\(connection\.grantedScope\)/);
  assert.match(block, /rescope_required/);
  // The check must come before the token is returned.
  assert.ok(block.indexOf('inspectDriveGrant') < block.indexOf('accessToken: token'));
});

test('Drive and Photos are separate OAuth clients', async () => {
  // Revocation removes a user's grant for a client. If these shared one client
  // id, migrating Drive would silently disconnect Photos as well.
  const adapters = await readFile(path.join(repoRoot, 'lib', 'smart-sync', 'oauth-adapters.js'), 'utf8');
  assert.match(adapters, /clientIdEnv: 'GOOGLE_DRIVE_CLIENT_ID'/);
  assert.match(adapters, /clientIdEnv: 'GOOGLE_PHOTOS_CLIENT_ID'/);
  assert.notEqual('GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_PHOTOS_CLIENT_ID');
});
