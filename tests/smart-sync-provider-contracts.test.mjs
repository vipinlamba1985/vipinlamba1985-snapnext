import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountDeletionFilters } from '../lib/account-deletion-plan.js';
import { listOAuthAdapterStatus, oauthAdapter } from '../lib/smart-sync/oauth-adapters.js';
import { listProviderStatus } from '../lib/smart-sync/providers.js';
import { cloudItemMatchesImportant, selectCloudProtection } from '../lib/smart-sync/selection.js';

function withEnv(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Dropbox and OneDrive report durable workers when credentials are configured', () => {
  withEnv({
    CLOUD_CONNECTOR_SECRET: 'secret',
    DROPBOX_CLIENT_ID: 'dropbox-id',
    DROPBOX_CLIENT_SECRET: 'dropbox-secret',
    ONEDRIVE_CLIENT_ID: 'onedrive-id',
    ONEDRIVE_CLIENT_SECRET: 'onedrive-secret',
    GOOGLE_PHOTOS_CLIENT_ID: 'photos-id',
    GOOGLE_PHOTOS_CLIENT_SECRET: 'photos-secret',
  }, () => {
    const providers = new Map(listProviderStatus().map(provider => [provider.id, provider]));
    assert.equal(providers.get('dropbox').syncStrategy, 'durable_cloud_job');
    assert.equal(providers.get('dropbox').availability, 'ready');
    assert.equal(providers.get('onedrive').syncStrategy, 'durable_cloud_job');
    assert.equal(providers.get('onedrive').availability, 'ready');
    assert.equal(providers.get('google_photos').availability, 'picker_ready');
  });
});

test('OAuth adapters keep read-only provider scopes and callback contracts', () => {
  assert.deepEqual(oauthAdapter('dropbox').scopes, ['files.metadata.read', 'files.content.read']);
  assert.deepEqual(oauthAdapter('onedrive').scopes, ['offline_access', 'Files.Read']);
  assert.equal(oauthAdapter('google_photos').callbackPath, '/api/smart-sync/oauth/google_photos/callback');
  assert.equal(listOAuthAdapterStatus().length, 4);
});

test('Shared Smart Sync selection understands provider-neutral favourite and recent signals', () => {
  const now = new Date('2026-07-28T12:00:00.000Z');
  const items = [
    { id: 'favorite', favorite: true, createdAt: '2020-01-01T00:00:00.000Z' },
    { id: 'recent', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'old', createdAt: '2018-01-01T00:00:00.000Z' },
  ];
  const rules = [
    { type: 'favorites', enabled: true, priority: 1 },
    { type: 'recent', enabled: true, priority: 2 },
  ];

  assert.equal(cloudItemMatchesImportant(items[0], rules, now), true);
  assert.equal(cloudItemMatchesImportant(items[1], rules, now), true);
  assert.equal(cloudItemMatchesImportant(items[2], rules, now), false);
  const selection = selectCloudProtection({ items, importableIds: items.map(item => item.id), syncMode: 'protect_important', rules, now });
  assert.deepEqual(selection.sourceFileIds, ['favorite', 'recent']);
  assert.equal(selection.indexedOnlyItems, 1);
});

test('Account deletion includes temporary Google Photos picker sessions', () => {
  const filters = buildAccountDeletionFilters({ userId: 'user-1' });
  assert.deepEqual(filters.smartSyncPickerSessions, { userId: 'user-1' });
});
