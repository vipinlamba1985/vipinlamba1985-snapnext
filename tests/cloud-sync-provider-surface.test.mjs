// Smart Import has one provider registry. All four launch web providers are
// user-selected picker/chooser surfaces; background whole-account sync remains disabled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SMART_SYNC_PROVIDERS,
  SMART_SYNC_PROVIDER_IDS,
  listPublicProviderStatus,
  publicProviderStatus,
  smartSyncProvider,
} from '../lib/smart-sync/providers.js';
import { SMART_SYNC_PROVIDERS as PROVIDER_ARRAY } from '../lib/smart-sync.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

test('there is exactly one provider registry', () => {
  assert.deepEqual(PROVIDER_ARRAY.map(p => p.id), SMART_SYNC_PROVIDER_IDS);
  assert.equal(PROVIDER_ARRAY.length, Object.keys(SMART_SYNC_PROVIDERS).length);
  for (const provider of PROVIDER_ARRAY) assert.equal(provider, SMART_SYNC_PROVIDERS[provider.id], `${provider.id} must be the registry object itself`);
});

test('every supported source is declared', () => {
  assert.deepEqual(SMART_SYNC_PROVIDER_IDS, ['google_drive', 'google_photos', 'dropbox', 'onedrive', 'ios_photos', 'android_media']);
});

test('all launch web sources are user-selected picker paths', () => {
  const drive = smartSyncProvider('google_drive');
  const photos = smartSyncProvider('google_photos');
  const dropbox = smartSyncProvider('dropbox');
  const onedrive = smartSyncProvider('onedrive');

  assert.equal(drive.syncStrategy, 'user_selected_picker');
  assert.match(drive.connectPath, /^\/cloud\/google-drive\//);
  assert.equal(photos.syncStrategy, 'user_selected_picker');
  assert.equal(photos.connectPath, '/smart-sync/oauth/google_photos/start');
  for (const provider of [dropbox, onedrive]) {
    assert.equal(provider.syncStrategy, 'user_selected_picker');
    assert.equal(provider.auth, 'hosted_picker');
    assert.equal(provider.connectPath, null);
    assert.ok(provider.capabilities.includes('documents'));
  }
});

test('the public provider shape never leaks environment variable names', () => {
  for (const provider of listPublicProviderStatus()) {
    assert.ok(!('env' in provider), `${provider.id} leaks its env keys to the browser`);
    assert.equal(typeof provider.available, 'boolean');
    assert.equal(typeof provider.configured, 'boolean');
  }
  const serialized = JSON.stringify(listPublicProviderStatus());
  assert.doesNotMatch(serialized, /CLIENT_SECRET|CLIENT_ID|CLOUD_CONNECTOR_SECRET/);
});

test('Dropbox and OneDrive become launch-available only when their public picker IDs are configured', () => {
  for (const id of ['dropbox', 'onedrive']) {
    const provider = smartSyncProvider(id);
    const saved = provider.env.map(key => process.env[key]);
    try {
      for (const key of provider.env) process.env[key] = 'test-value';
      const status = publicProviderStatus(provider);
      assert.equal(status.configured, true);
      assert.equal(status.availability, 'picker_ready');
      assert.equal(status.launchAvailable, true);
      assert.equal(status.available, true);
    } finally {
      provider.env.forEach((key, index) => {
        if (saved[index] === undefined) delete process.env[key];
        else process.env[key] = saved[index];
      });
    }
  }
});

test('native providers are never gated on server credentials', () => {
  for (const id of ['ios_photos', 'android_media']) {
    const status = publicProviderStatus(smartSyncProvider(id));
    assert.equal(status.available, true);
    assert.equal(status.availability, 'native_app_required');
  }
});

test('Smart Import exposes all four picker actions and never starts Dropbox or OneDrive background OAuth', async () => {
  const page = await read(path.join('app', '(app)', 'imports', 'page.js'));
  assert.doesNotMatch(page, /CLOUD_OPTIONS/);
  assert.match(page, /\/cloud\/google-drive\/start/);
  assert.match(page, /\/smart-sync\/oauth\/google_photos\/start/);
  assert.match(page, /smart-import-dropbox/);
  assert.match(page, /smart-import-onedrive/);
  assert.match(page, /Dropbox\.choose/);
  assert.match(page, /OneDrive\.open/);
  assert.doesNotMatch(page, /oauth\/dropbox\/start|oauth\/onedrive\/start/);
});

test('the providers endpoint remains authenticated and returns the safe registry shape', async () => {
  const route = await read(path.join('app', 'api', 'smart-sync', 'providers', 'route.js'));
  assert.match(route, /getUserFromRequest/);
  assert.match(route, /status: 401/);
  assert.match(route, /listPublicProviderStatus/);
  assert.doesNotMatch(route, /listProviderStatus\(\)/, 'the raw shape carries env names');
});
