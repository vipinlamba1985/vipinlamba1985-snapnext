// Cloud Sync was unreachable in practice: it sat inside the collapsed "More"
// menu, which on mobile is behind the hamburger, and the bottom bar only ever
// shows the five primary items. Bringing photos in from a cloud is the same job
// as adding them from the device, so its entry point belongs on /upload (Add).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

test('Add links to Cloud Sync', async () => {
  const page = await read(path.join('app', '(app)', 'upload', 'page.js'));
  assert.match(page, /data-testid="upload-cloud-sync"/);
  assert.match(page, /href="\/imports"/);
  // Naming the clouds is the point — the old page hid them behind "More".
  assert.match(page, /Google Drive/);
  assert.match(page, /Dropbox/);
  assert.match(page, /OneDrive/);
});

test('Cloud Sync is no longer buried in the More menu', async () => {
  const shell = await read(path.join('components', 'AppShell.js'));

  const moreMatch = shell.match(/const MORE_HREFS = \[([\s\S]*?)\]/);
  assert.ok(moreMatch, 'MORE_HREFS could not be found');
  assert.doesNotMatch(moreMatch[1], /'\/imports'/, 'Cloud Sync should live under Add, not More');

  // The route entry itself must stay: AppShell resolves the page's label and
  // gating from ROUTES, independently of which menu lists it.
  assert.match(shell, /\{ href: '\/imports', label: 'Cloud Sync'/);
});

test('primary navigation is still exactly five items', async () => {
  const shell = await read(path.join('components', 'AppShell.js'));
  const match = shell.match(/const PRIMARY_HREFS = \[([^\]]*)\]/);
  assert.ok(match, 'PRIMARY_HREFS could not be found');
  const hrefs = match[1].split(',').map(value => value.trim().replace(/'/g, '')).filter(Boolean);
  assert.equal(hrefs.length, 5, 'moving Cloud Sync must not add a sixth nav item');
  assert.ok(hrefs.includes('/upload'), 'Add must remain primary — it now hosts Cloud Sync');
  assert.ok(!hrefs.includes('/imports'), 'Cloud Sync is reached through Add, not its own nav item');
});
