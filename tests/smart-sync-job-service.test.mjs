import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SmartSyncJobServiceError,
  createOrReuseSmartSyncJob,
  getSmartSyncProviderReadiness,
  parseSmartSyncJobRequest,
} from '../lib/smart-sync/job-service.js';

test('Smart Sync job request accepts the legacy fileIds alias', () => {
  const parsed = parseSmartSyncJobRequest({
    fileIds: ['a', 'b'],
    mode: 'automatic',
    estimatedItems: '2',
    estimatedBytes: '4096',
  });

  assert.deepEqual(parsed.sourceFileIds, ['a', 'b']);
  assert.equal(parsed.estimatedItems, 2);
  assert.equal(parsed.estimatedBytes, 4096);
});

test('Smart Sync job request rejects invalid estimates before database work', () => {
  assert.throws(
    () => parseSmartSyncJobRequest({ estimatedItems: -1 }),
    error => error instanceof SmartSyncJobServiceError && error.code === 'smart_sync_job_request_invalid',
  );
});

test('Smart Sync service fails closed when the profile is not approved', async () => {
  await assert.rejects(
    () => createOrReuseSmartSyncJob({
      db: null,
      userId: 'user-1',
      profile: { providerId: 'google_drive', enabled: true, approvedAt: null },
      body: {},
    }),
    error => error instanceof SmartSyncJobServiceError && error.code === 'profile_not_approved',
  );
});

test('Smart Sync provider readiness rejects unsupported providers before database access', async () => {
  await assert.rejects(
    () => getSmartSyncProviderReadiness({ db: null, userId: 'user-1', profile: { providerId: 'unknown' } }),
    error => error instanceof SmartSyncJobServiceError && error.code === 'provider_unsupported',
  );
});
