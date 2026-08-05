// Import from Cloud must remain reachable from the first Add screen. The local
// upload flow is now deliberately shorter, but simplifying it must not bury the
// provider entry point again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

async function addLandingPage() {
  const layout = await read(path.join('app', '(app)', 'upload', 'layout.js'));
  const redirect = layout.match(/router\.replace\('([^']+)'\)/);
  return redirect ? redirect[1] : '/upload';
}

test('Add lands on the discovery screen, not /upload', async () => {
  assert.equal(await addLandingPage(), '/upload/discover');
});

test('the screen Add actually lands on links to Import from Cloud', async () => {
  const landing = await addLandingPage();
  assert.equal(landing, '/upload/discover', 'update this test if the landing page moves');

  const page = await read(path.join('app', '(app)', 'upload', 'discover', 'DiscoveryFlow.js'));
  assert.match(page, /data-testid="upload-cloud-sync"/);
  assert.match(page, /href="\/imports"/);
  assert.match(page, /Google Drive/);
  assert.match(page, /Google Photos/);
  assert.match(page, /Dropbox/);
  assert.match(page, /OneDrive/);
});

test('the cloud card stays on the first screen before local upload review', async () => {
  const page = await read(path.join('app', '(app)', 'upload', 'discover', 'DiscoveryFlow.js'));
  const welcome = page.indexOf("flow.stage === 'welcome'");
  const review = page.indexOf('const readyCount');
  const card = page.indexOf('data-testid="upload-cloud-sync"');

  assert.ok(welcome !== -1 && review !== -1 && card !== -1);
  assert.ok(card > welcome && card < review, 'the card must render in the welcome stage');
});

test('Import from Cloud is no longer buried in the More menu', async () => {
  const shell = await read(path.join('components', 'AppShell.js'));

  const moreMatch = shell.match(/const MORE_HREFS = \[([\s\S]*?)\]/);
  assert.ok(moreMatch, 'MORE_HREFS could not be found');
  assert.doesNotMatch(moreMatch[1], /'\/imports'/, 'Import from Cloud should live under Add, not More');
  assert.match(shell, /\{ href: '\/imports', label: 'Import from Cloud'/);
});

test('primary navigation is still exactly five items', async () => {
  const shell = await read(path.join('components', 'AppShell.js'));
  const match = shell.match(/const PRIMARY_HREFS = \[([^\]]*)\]/);
  assert.ok(match, 'PRIMARY_HREFS could not be found');
  const hrefs = match[1].split(',').map(value => value.trim().replace(/'/g, '')).filter(Boolean);
  assert.equal(hrefs.length, 5, 'moving Import from Cloud must not add a sixth nav item');
  assert.ok(hrefs.includes('/upload'), 'Add must remain primary — it now hosts Import from Cloud');
  assert.ok(!hrefs.includes('/imports'), 'Import from Cloud is reached through Add, not its own nav item');
});
