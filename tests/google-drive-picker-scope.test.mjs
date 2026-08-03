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
  assert.match(route, /auth\/drive\.file/);
  assert.doesNotMatch(route, /auth\/drive\.readonly/, 'the restricted scope must not come back');
});

test('no adapter requests a restricted Drive scope either', async () => {
  const adapters = await read(path.join('lib', 'smart-sync', 'oauth-adapters.js'));
  assert.doesNotMatch(adapters, /auth\/drive\.readonly/);
  // Google Photos must use the Picker API; the old library scopes stopped
  // working in March 2025.
  assert.match(adapters, /photospicker\.mediaitems\.readonly/);
  assert.doesNotMatch(adapters, /photoslibrary/);
});

test('listing a whole Drive is refused rather than silently broken', async () => {
  const route = await read(DRIVE_ROUTE);
  // drive.file cannot list a Drive, so the old endpoint must say so clearly
  // instead of returning an empty list that looks like an empty Drive.
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

test('the page opens the Picker instead of paging through a Drive', async () => {
  const page = await read(IMPORTS_PAGE);
  assert.match(page, /data-testid="drive-open-picker"/);
  assert.match(page, /google\.picker\.PickerBuilder/);
  assert.match(page, /setOAuthToken/);

  // The old whole-library controls cannot come back — they only worked with
  // the restricted scope.
  assert.doesNotMatch(page, /Load complete library/);
  assert.doesNotMatch(page, /Load next 100/);
});

test('a picked selection is still bounded', async () => {
  const page = await read(IMPORTS_PAGE);
  // The Picker allows multi-select, so the per-import ceiling still applies.
  assert.match(page, /picked\.length > MAX_SELECTED_FILES/);
});

test('the feature is not called sync anywhere users can see', async () => {
  for (const file of [IMPORTS_PAGE, path.join('components', 'AppShell.js'), path.join('app', 'login', 'page.js'), path.join('app', 'signup', 'page.js')]) {
    const source = await read(file);
    // Comments may explain the history; user-visible strings must not promise
    // continuous synchronisation that does not happen.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /Cloud Sync/, `${file} still calls it Cloud Sync`);
  }
});

test('a grant issued under the old scope is revoked, not reused', async () => {
  const route = await read(DRIVE_ROUTE);
  // Rewriting what the code requests does not narrow a grant Google already
  // issued, so an old connection must be handed back rather than kept.
  assert.match(route, /grantedScope: DRIVE_SCOPE/);
  assert.match(route, /needsRescope/);
  assert.match(route, /oauth2\.googleapis\.com\/revoke/);
  assert.match(route, /rescope_required/);
  // Local credentials go even if the revoke call fails — keeping them is worse.
  assert.match(route, /deleteOne\(\{ _id: connection\._id \}\)/);
});

test('the Picker fails closed when it is not fully configured', async () => {
  const route = await read(DRIVE_ROUTE);
  assert.match(route, /picker_not_configured/);
  // Both are needed: the key authorises the widget, the project number
  // associates picked files with this app.
  assert.match(route, /NEXT_PUBLIC_GOOGLE_PICKER_API_KEY \|\| !process\.env\.GOOGLE_DRIVE_PROJECT_NUMBER/);
});

test('Drive is never written to, because the scope alone does not prevent it', async () => {
  // drive.file permits create and modify. Read-only behaviour is a property of
  // this code, not of the scope, so it has to be asserted here.
  const route = await read(DRIVE_ROUTE);
  const driveCalls = [...route.matchAll(/googleapis\.com\/(?:upload\/)?drive\/v3\/[^\s'"`]*/g)].map(m => m[0]);
  assert.ok(driveCalls.length > 0, 'expected some Drive API usage to check');
  for (const call of driveCalls) {
    assert.doesNotMatch(call, /\/permissions|\/copy|\/trash/, `${call} is not a read`);
  }
  assert.doesNotMatch(route, /method: 'DELETE'[^}]*drive\/v3/s);
  assert.doesNotMatch(route, /upload\/drive\/v3/, 'uploading to a user Drive is never correct here');
});

test('the read-only claim in the docs matches what the scope actually allows', async () => {
  const doc = await read(path.join('docs', 'CLOUD_SYNC_STATUS.md'));
  // The old blanket claim was false once Drive moved to drive.file.
  assert.doesNotMatch(doc, /All cloud access is \*\*read-only\*\*/);
  assert.match(doc, /per-file scope, not a read-only one/);
});
