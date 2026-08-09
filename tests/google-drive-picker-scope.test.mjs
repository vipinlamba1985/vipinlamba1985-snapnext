// Google Drive asked for `drive.readonly` — a restricted scope that reads a
// user's entire Drive and requires an annual third-party security assessment
// before it can be used outside testing. SnapNext only ever needs the files
// someone chooses, so it now asks for the per-file `drive.file` scope and lets
// Google's Picker do the choosing. These tests keep the restricted scope out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');
const DRIVE_ROUTE = path.join('app', 'api', 'cloud', 'google-drive', '[[...action]]', 'route.js');
const IMPORTS_PAGE = path.join('app', '(app)', 'imports', 'page.js');

test('Drive asks for the per-file scope, never the restricted one', async () => {
  const route = await read(DRIVE_ROUTE);
  const scopes = await read(path.join('lib', 'google-drive-scope.js'));
  assert.match(scopes, /REQUIRED_DRIVE_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/drive\.file'/);
  assert.match(route, /DRIVE_SCOPE = REQUIRED_DRIVE_SCOPE/);
  assert.doesNotMatch(route, /auth\/drive\.readonly/, 'the restricted scope must not come back');
});

test('no adapter requests a restricted Drive scope either', async () => {
  const adapters = await read(path.join('lib', 'smart-sync', 'oauth-adapters.js'));
  assert.doesNotMatch(adapters, /auth\/drive\.readonly/);
  assert.match(adapters, /photospicker\.mediaitems\.readonly/);
  assert.doesNotMatch(adapters, /photoslibrary/);
});

test('listing a whole Drive is refused rather than silently broken', async () => {
  const route = await read(DRIVE_ROUTE);
  assert.match(route, /picker_required/);
  assert.match(route, /410/);
});

test('the Picker token is short-lived and carries no refresh token', async () => {
  const route = await read(DRIVE_ROUTE);
  const block = route.slice(route.indexOf("action === 'picker-token'"), route.indexOf("action === 'files'"));
  assert.match(block, /accessToken: token/);
  assert.doesNotMatch(block, /refreshToken/, 'the refresh token must never reach the browser');
  assert.doesNotMatch(block, /client_secret/i);
});

test('the Smart Import page opens the Picker instead of paging through a Drive', async () => {
  const page = await read(IMPORTS_PAGE);
  assert.match(page, /(?:data-testid|testId)="drive-open-picker"/);
  assert.match(page, /google\.picker\.PickerBuilder/);
  assert.match(page, /setOAuthToken/);
  assert.doesNotMatch(page, /Load complete library/);
  assert.doesNotMatch(page, /Load next 100/);
});

test('a picked selection is still bounded', async () => {
  const page = await read(IMPORTS_PAGE);
  assert.match(page, /picked\.length > MAX_SELECTED_FILES/);
});

test('user-facing launch import is not mislabeled as an active Cloud Sync feature', async () => {
  for (const file of [IMPORTS_PAGE, path.join('components', 'AppShell.js'), path.join('app', 'login', 'page.js'), path.join('app', 'signup', 'page.js')]) {
    const source = await read(file);
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/Auto Cloud Sync/g, '');
    assert.doesNotMatch(code, /Cloud Sync/, `${file} still presents Cloud Sync as a launch import feature`);
  }
});

test('a grant issued under the old scope is revoked, not reused', async () => {
  const route = await read(DRIVE_ROUTE);
  assert.match(route, /grantedScope: grant\.scopes\.join/);
  assert.match(route, /needsRescope/);
  assert.match(route, /oauth2\.googleapis\.com\/revoke/);
  assert.match(route, /rescope_required/);
  assert.match(route, /deleteOne\(\{ _id: connection\._id \}\)/);
});

test('the Picker fails closed when it is not fully configured', async () => {
  const route = await read(DRIVE_ROUTE);
  assert.match(route, /picker_not_configured/);
  assert.match(route, /NEXT_PUBLIC_GOOGLE_PICKER_API_KEY \|\| !process\.env\.GOOGLE_DRIVE_PROJECT_NUMBER/);
});

test('Drive is never written to, because the scope alone does not prevent it', async () => {
  const route = await read(DRIVE_ROUTE);
  const driveCalls = [...route.matchAll(/googleapis\.com\/(?:upload\/)?drive\/v3\/[^\s'"`]*/g)].map(m => m[0]);
  assert.ok(driveCalls.length > 0, 'expected some Drive API usage to check');
  for (const call of driveCalls) assert.doesNotMatch(call, /\/permissions|\/copy|\/trash/, `${call} is not a read`);
  assert.doesNotMatch(route, /method: 'DELETE'[^}]*drive\/v3/s);
  assert.doesNotMatch(route, /upload\/drive\/v3/, 'uploading to a user Drive is never correct here');
});

test('the read-only claim in the docs matches what the scope actually allows', async () => {
  const doc = await read(path.join('docs', 'CLOUD_SYNC_STATUS.md'));
  assert.doesNotMatch(doc, /All cloud access is \*\*read-only\*\*/);
  assert.match(doc, /per-file scope, not a read-only one/);
});
