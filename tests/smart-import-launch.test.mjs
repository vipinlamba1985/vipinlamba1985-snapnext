import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

test('launch registry makes Google sources picker-only and defers Dropbox/OneDrive background access', async () => {
  const source = await read('lib/smart-sync/providers.js');
  assert.match(source, /google_drive:[\s\S]*?syncStrategy: 'user_selected_picker'/);
  assert.match(source, /google_photos:[\s\S]*?syncStrategy: 'user_selected_picker'/);
  assert.match(source, /dropbox:[\s\S]*?syncStrategy: 'deferred_picker'/);
  assert.match(source, /onedrive:[\s\S]*?syncStrategy: 'deferred_picker'/);
  assert.doesNotMatch(source.match(/google_drive:[\s\S]*?google_photos:/)?.[0] || '', /auto_sync/);
  assert.doesNotMatch(source.match(/google_photos:[\s\S]*?dropbox:/)?.[0] || '', /auto_sync/);
});

test('new Dropbox and OneDrive OAuth starts are blocked at launch', async () => {
  const source = await read('app/api/smart-sync/oauth/[provider]/[action]/route.js');
  assert.match(source, /LAUNCH_OAUTH_PROVIDERS = new Set\(\['google_photos'\]\)/);
  assert.match(source, /smart_import_picker_required/);
  assert.match(source, /\['start', 'callback'\]/);
});

test('Smart Sync UI is retired into the Smart Import launch path', async () => {
  const source = await read('app/(app)/smart-sync/page.js');
  assert.match(source, /Open Smart Import/);
  assert.match(source, /href="\/imports"/);
  assert.match(source, /Auto Cloud Sync — not enabled at launch/);
  assert.doesNotMatch(source, /savePlan|startGooglePhotosPicker|runBatch/);
});

test('Smart Import owns Google picker flows and gives deferred providers a file-upload fallback', async () => {
  const source = await read('app/(app)/imports/page.js');
  assert.match(source, /Google Photos/);
  assert.match(source, /Google Drive/);
  assert.match(source, /drive-open-picker/);
  assert.match(source, /smart-import-google-photos/);
  assert.match(source, /title="Dropbox"/);
  assert.match(source, /title="OneDrive"/);
  assert.match(source, /href="\/upload\/discover"/);
  assert.doesNotMatch(source, /oauth\/dropbox\/start|oauth\/onedrive\/start/);
});

test('generic web job API cannot create background discovery work', async () => {
  const source = await read('lib/smart-sync/job-service.js');
  assert.match(source, /background_cloud_sync_disabled/);
  assert.match(source, /provider\?\.surface === 'web' && !request\.sourceFileIds\?\.length/);
  assert.match(source, /mode: 'manual_selection'/);
});

test('Google Photos picker no longer depends on an approved Smart Sync profile', async () => {
  const source = await read('app/api/smart-sync/google-photos/[...action]/route.js');
  assert.doesNotMatch(source, /smart_sync_profiles/);
  assert.match(source, /IMPORT_PROFILE/);
  assert.match(source, /mode: 'manual_selection'/);
});

test('provider worker and recovery cron process selected Google Photos imports only', async () => {
  const worker = await read('lib/smart-sync/provider-job-worker.js');
  const cron = await read('app/api/cron/smart-import-recovery/route.js');
  assert.match(worker, /job\.providerId !== 'google_photos' \|\| job\.mode !== 'manual_selection'/);
  assert.match(worker, /export async function ensureProviderAutomaticJob\(\)[\s\S]*?return null/);
  assert.match(cron, /providerId: 'google_photos', mode: 'manual_selection'/);
  assert.doesNotMatch(cron, /autoSyncEnabled|ensureGoogleDriveAutomaticJob|ensureProviderAutomaticJob/);
});
