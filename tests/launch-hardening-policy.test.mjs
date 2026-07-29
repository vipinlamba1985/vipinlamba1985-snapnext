import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('public prototype routes are absent', () => {
  assert.equal(fs.existsSync('app/snapnext-v3/page.js'), false);
  assert.equal(fs.existsSync('app/merged-preview/page.js'), false);
  assert.equal(fs.existsSync('app/review-app/page.js'), false);
});

test('native billing hides web checkout and portal controls', () => {
  const billing = read('app/(app)/billing/page.js');
  assert.match(billing, /Capacitor\.isNativePlatform\(\)/);
  assert.match(billing, /Web checkout and external payment links are not shown/);
  assert.match(billing, /if \(Capacitor\.isNativePlatform\(\)\)/);
  assert.match(billing, /nativePlatform \?/);
});

test('core media dialogs use the shared accessibility contract', () => {
  const hook = read('hooks/use-escape-close.js');
  const gallery = read('app/(app)/gallery/page.js');
  const viewer = read('components/magic-library/MediaViewer.js');
  const lockedPerson = read('components/magic-library/LockedPersonPrompt.js');
  assert.match(hook, /event\.key !== 'Escape'/);
  assert.match(hook, /event\.key !== 'Tab'/);
  for (const source of [gallery, viewer, lockedPerson]) {
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /useAccessibleDialog/);
  }
});

test('Vercel schedules both Smart Sync and trash lifecycle jobs', () => {
  const config = JSON.parse(read('vercel.json'));
  const paths = config.crons.map((cron) => cron.path);
  assert.ok(paths.includes('/api/cron/google-drive-sync'));
  assert.ok(paths.includes('/api/cron/trash-purge'));
});
