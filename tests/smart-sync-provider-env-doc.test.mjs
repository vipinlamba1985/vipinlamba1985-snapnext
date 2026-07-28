import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const checklist = fs.readFileSync(new URL('../docs/SMART_SYNC_PROVIDER_ENV_CHECKLIST.md', import.meta.url), 'utf8');

test('Smart Sync documents every production provider callback', () => {
  assert.match(checklist, /api\/cloud\/google-drive\/callback/);
  assert.match(checklist, /api\/smart-sync\/oauth\/google_photos\/callback/);
  assert.match(checklist, /api\/smart-sync\/oauth\/dropbox\/callback/);
  assert.match(checklist, /api\/smart-sync\/oauth\/onedrive\/callback/);
});
