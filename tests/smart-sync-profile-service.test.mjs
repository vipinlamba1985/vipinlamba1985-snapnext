import test from 'node:test';
import assert from 'node:assert/strict';
import { SmartSyncJobServiceError } from '../lib/smart-sync/job-service.js';
import {
  publicCloudAsset,
  saveSmartSyncProfile,
  smartSyncPlanFingerprint,
} from '../lib/smart-sync/profile-service.js';

test('Smart Sync plan fingerprint changes when the approved plan changes', () => {
  const base = {
    providerId: 'google_drive',
    mode: 'manual',
    rules: [{ type: 'recent', enabled: true, priority: 1 }],
    stopAtCapacity: true,
    notifyOnComplete: true,
  };
  const same = { ...base };
  const changed = { ...base, stopAtCapacity: false };

  assert.equal(smartSyncPlanFingerprint(base), smartSyncPlanFingerprint(same));
  assert.notEqual(smartSyncPlanFingerprint(base), smartSyncPlanFingerprint(changed));
});

test('Smart Sync public cloud asset omits private/internal fields', () => {
  const asset = publicCloudAsset({
    id: 'asset-1',
    userId: 'user-1',
    provider: 'google_drive',
    providerFileId: 'provider-1',
    name: 'photo.jpg',
    mime: 'image/jpeg',
    size: 123,
    checksum: 'secret-checksum',
    storageKey: 'users/user-1/media/private',
  });

  assert.equal(asset.id, 'asset-1');
  assert.equal(asset.size, 123);
  assert.equal('userId' in asset, false);
  assert.equal('checksum' in asset, false);
  assert.equal('storageKey' in asset, false);
});

test('Smart Sync profile service requires explicit approval before enabling', async () => {
  const db = {
    collection(name) {
      if (name === 'smart_sync_profiles') return { findOne: async () => null };
      if (name === 'cloud_connections') return { findOne: async () => ({ provider: 'google_drive' }) };
      throw new Error(`Unexpected collection ${name}`);
    },
  };

  await assert.rejects(
    () => saveSmartSyncProfile({
      db,
      userId: 'user-1',
      body: {
        profile: {
          enabled: true,
          providerId: 'google_drive',
          rules: [{ id: 'recent', type: 'recent', enabled: true, priority: 1 }],
        },
      },
    }),
    error => error instanceof SmartSyncJobServiceError
      && error.code === 'plan_approval_required'
      && error.requiresApproval === true,
  );
});
