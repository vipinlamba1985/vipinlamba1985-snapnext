// Cloud Sync used to hardcode its own provider list, which told users Dropbox
// and OneDrive were "coming soon" long after both were fully implemented, left
// Google Photos out entirely, and connected Google Drive no matter which tile
// was clicked. These tests keep the surfaces reading from the one registry.
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
import { oauthAdapter } from '../lib/smart-sync/oauth-adapters.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

test('there is exactly one provider registry', () => {
  // lib/smart-sync.js used to keep a second hand-maintained copy. It is now a
  // view over the registry, so the two cannot disagree about which clouds exist.
  assert.deepEqual(PROVIDER_ARRAY.map(p => p.id), SMART_SYNC_PROVIDER_IDS);
  assert.equal(PROVIDER_ARRAY.length, Object.keys(SMART_SYNC_PROVIDERS).length);
  for (const provider of PROVIDER_ARRAY) {
    assert.equal(provider, SMART_SYNC_PROVIDERS[provider.id], `${provider.id} must be the registry object itself`);
  }
});

test('every supported cloud is declared', () => {
  assert.deepEqual(SMART_SYNC_PROVIDER_IDS, [
    'google_drive',
    'google_photos',
    'dropbox',
    'onedrive',
    'ios_photos',
    'android_media',
  ]);
});

test('every web provider has a way to connect', () => {
  for (const provider of Object.values(SMART_SYNC_PROVIDERS)) {
    if (provider.surface !== 'web') {
      assert.equal(provider.connectPath, null, `${provider.id} is native and needs no web connect path`);
      continue;
    }
    assert.ok(provider.connectPath, `${provider.id} must declare how it connects`);
    assert.ok(provider.env.length, `${provider.id} must declare its credentials`);
    assert.ok(provider.description, `${provider.id} must explain itself to the user`);

    // Google Drive predates the shared adapter and keeps its own route; every
    // other web provider must have a real OAuth adapter behind it.
    if (provider.id === 'google_drive') {
      assert.match(provider.connectPath, /^\/cloud\/google-drive\//);
    } else {
      assert.ok(oauthAdapter(provider.id), `${provider.id} has no OAuth adapter`);
      assert.equal(provider.connectPath, `/smart-sync/oauth/${provider.id}/start`);
    }
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

test('availability follows configured credentials, not a hand-maintained flag', () => {
  const dropbox = smartSyncProvider('dropbox');
  const saved = dropbox.env.map(key => process.env[key]);
  try {
    for (const key of dropbox.env) delete process.env[key];
    const missing = publicProviderStatus(dropbox);
    assert.equal(missing.available, false);
    assert.equal(missing.configured, false);
    assert.equal(missing.availability, 'credentials_required');

    for (const key of dropbox.env) process.env[key] = 'test-value';
    const ready = publicProviderStatus(dropbox);
    assert.equal(ready.available, true);
    assert.equal(ready.availability, 'ready');
  } finally {
    dropbox.env.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  }
});

test('native providers are never gated on server credentials', () => {
  for (const id of ['ios_photos', 'android_media']) {
    const status = publicProviderStatus(smartSyncProvider(id));
    assert.equal(status.available, true);
    assert.equal(status.availability, 'native_app_required');
  }
});

test('Cloud Sync renders the live registry instead of a hardcoded list', async () => {
  const page = await read(path.join('app', '(app)', 'imports', 'page.js'));

  // The old hardcoded list and its false "Soon" labels must not come back.
  assert.doesNotMatch(page, /CLOUD_OPTIONS/, 'provider list must come from the server');
  assert.doesNotMatch(page, /available: (true|false)/, 'availability is a deployment fact, not a literal');
  assert.match(page, /apiFetch\('\/smart-sync\/providers'/);

  // Clicking a tile must connect that provider, not always Google Drive.
  assert.match(page, /provider\.id === 'google_drive'/);
  assert.match(page, /\/smart-sync\/oauth\/\$\{provider\.id\}\/start/);
});

test('the providers endpoint requires a session and returns the safe shape', async () => {
  const route = await read(path.join('app', 'api', 'smart-sync', 'providers', 'route.js'));
  assert.match(route, /getUserFromRequest/);
  assert.match(route, /status: 401/);
  assert.match(route, /listPublicProviderStatus/);
  assert.doesNotMatch(route, /listProviderStatus\(\)/, 'the raw shape carries env names');
});
