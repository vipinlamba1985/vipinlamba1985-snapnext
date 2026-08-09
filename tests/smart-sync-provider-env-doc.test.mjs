import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const checklist = fs.readFileSync(new URL('../docs/SMART_SYNC_PROVIDER_ENV_CHECKLIST.md', import.meta.url), 'utf8');

test('Smart Import documents launch callbacks and hosted picker redirect', () => {
  assert.match(checklist, /api\/cloud\/google-drive\/callback/);
  assert.match(checklist, /api\/smart-sync\/oauth\/google_photos\/callback/);
  assert.match(checklist, /onedrive-picker-redirect/);
  assert.doesNotMatch(checklist, /api\/smart-sync\/oauth\/dropbox\/callback/);
  assert.doesNotMatch(checklist, /api\/smart-sync\/oauth\/onedrive\/callback/);
});

test('launch checklist requires all four picker configurations without Dropbox or OneDrive client secrets', () => {
  assert.match(checklist, /NEXT_PUBLIC_GOOGLE_PICKER_API_KEY/);
  assert.match(checklist, /GOOGLE_DRIVE_PROJECT_NUMBER/);
  assert.match(checklist, /DROPBOX_CLIENT_ID/);
  assert.match(checklist, /ONEDRIVE_CLIENT_ID/);
  assert.match(checklist, /client secret is \*\*not required\*\*/i);
  assert.match(checklist, /ONEDRIVE_TENANT_ID.*not required/i);
  assert.match(checklist, /api\/cron\/smart-import-recovery/);
});

test('remote picker documentation locks selected-file safety boundaries', () => {
  assert.match(checklist, /api\/smart-import\/remote-selection/);
  assert.match(checklist, /validates the provider hostname/);
  assert.match(checklist, /SHA-256/);
  assert.match(checklist, /photos, videos, PDFs and common office\/text document formats/);
});
