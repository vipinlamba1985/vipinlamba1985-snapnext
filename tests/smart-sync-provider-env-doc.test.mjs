import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const checklist = fs.readFileSync(new URL('../docs/SMART_SYNC_PROVIDER_ENV_CHECKLIST.md', import.meta.url), 'utf8');

test('Smart Import documents only launch provider callbacks', () => {
  assert.match(checklist, /api\/cloud\/google-drive\/callback/);
  assert.match(checklist, /api\/smart-sync\/oauth\/google_photos\/callback/);
  assert.doesNotMatch(checklist, /api\/smart-sync\/oauth\/dropbox\/callback/);
  assert.doesNotMatch(checklist, /api\/smart-sync\/oauth\/onedrive\/callback/);
});

test('launch checklist requires picker setup and says deferred credentials are not blockers', () => {
  assert.match(checklist, /NEXT_PUBLIC_GOOGLE_PICKER_API_KEY/);
  assert.match(checklist, /GOOGLE_DRIVE_PROJECT_NUMBER/);
  assert.match(checklist, /Not required for launch/);
  assert.match(checklist, /Dropbox and OneDrive are registered as `future_picker`/);
  assert.match(checklist, /api\/cron\/smart-import-recovery/);
});
