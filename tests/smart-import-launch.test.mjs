import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

test('launch registry makes all four web cloud sources picker-only', async () => {
  const source = await read('lib/smart-sync/providers.js');
  for (const id of ['google_drive', 'google_photos', 'dropbox', 'onedrive']) {
    assert.match(source, new RegExp(`${id}:[\\s\\S]*?syncStrategy: 'user_selected_picker'`));
  }
  assert.match(source, /dropbox:[\s\S]*?auth: 'hosted_picker'/);
  assert.match(source, /onedrive:[\s\S]*?auth: 'hosted_picker'/);
  assert.doesNotMatch(source.match(/google_drive:[\s\S]*?ios_photos:/)?.[0] || '', /auto_sync/);
});

test('legacy Dropbox and OneDrive OAuth starts remain blocked even though hosted pickers launch', async () => {
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

test('Smart Import exposes Google, Dropbox and OneDrive picker flows without background provider OAuth', async () => {
  const source = await read('app/(app)/imports/page.js');
  assert.match(source, /Google Photos/);
  assert.match(source, /Google Drive/);
  assert.match(source, /drive-open-picker/);
  assert.match(source, /smart-import-google-photos/);
  assert.match(source, /smart-import-dropbox/);
  assert.match(source, /smart-import-onedrive/);
  assert.match(source, /Dropbox\.choose/);
  assert.match(source, /OneDrive\.open/);
  assert.match(source, /smart-import\/remote-selection/);
  assert.doesNotMatch(source, /oauth\/dropbox\/start|oauth\/onedrive\/start/);
});

test('hosted picker importer is selected-file only and SSRF constrained', async () => {
  const source = await read('app/api/smart-import/remote-selection/route.js');
  assert.match(source, /PROVIDERS = new Set\(\['dropbox', 'onedrive'\]\)/);
  assert.match(source, /MAX_BATCH = 5/);
  assert.match(source, /redirect: 'manual'/);
  assert.match(source, /allowedHost\(provider, url\.hostname\)/);
  assert.match(source, /url\.protocol !== 'https:'/);
  assert.match(source, /crypto\.createHash\('sha256'\)/);
  assert.match(source, /kind:?[\s\S]*document|return 'document'/);
  assert.doesNotMatch(source, /cloud_connections|smart_sync_jobs|refreshToken/);
});

test('OneDrive picker token is explicitly discarded and not sent to server', async () => {
  const source = await read('app/(app)/imports/page.js');
  assert.match(source, /response can include an accessToken/);
  assert.match(source, /does not persist or transmit it/);
  assert.doesNotMatch(source, /accessToken:\s*response\.accessToken/);
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
