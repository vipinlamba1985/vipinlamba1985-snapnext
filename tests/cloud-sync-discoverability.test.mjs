// Import from Cloud remains reachable from the first Add screen. Frozen
// Navigation v1 deliberately keeps it out of primary navigation and More.
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
  assert.equal(landing, '/upload/discover');
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
  assert.ok(card > welcome && card < review);
});

test('Import from Cloud is owned by Add and is not a primary or More destination', async () => {
  const shell = await read(path.join('components', 'AppShell.js'));
  const moreMatch = shell.match(/const MORE_HREFS = \[([\s\S]*?)\]/);
  const primaryMatch = shell.match(/const PRIMARY_HREFS = \[([^\]]*)\]/);
  assert.ok(moreMatch && primaryMatch);
  assert.doesNotMatch(moreMatch[1], /'\/imports'/);
  assert.doesNotMatch(primaryMatch[1], /'\/imports'/);
});

test('primary navigation remains exactly five items with Add as the intake owner', async () => {
  const shell = await read(path.join('components', 'AppShell.js'));
  const match = shell.match(/const PRIMARY_HREFS = \[([^\]]*)\]/);
  assert.ok(match);
  const hrefs = match[1].split(',').map(value => value.trim().replace(/'/g, '')).filter(Boolean);
  assert.equal(hrefs.length, 5);
  assert.ok(hrefs.includes('/upload'));
  assert.ok(!hrefs.includes('/imports'));
});
