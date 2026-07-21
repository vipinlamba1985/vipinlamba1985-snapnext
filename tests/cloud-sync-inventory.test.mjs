import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUD_ASSET_STATES,
  mergeSyncMetrics,
  metricsIncrementPatch,
  normalizeDriveAsset,
  normalizeProviderChecksum,
  resolveCloudAssetImportState,
} from '../lib/smart-sync/cloud-assets.js';
import { createSmartSyncJob } from '../lib/smart-sync/jobs.js';

test('Drive metadata prefers the strongest provider checksum', () => {
  assert.deepEqual(
    normalizeProviderChecksum({ md5Checksum: 'MD5', sha1Checksum: 'SHA1', sha256Checksum: 'SHA256' }),
    { algorithm: 'sha256', value: 'sha256' },
  );
});

test('Cloud inventory distinguishes available items from verified safe items', () => {
  const asset = normalizeDriveAsset({
    id: 'drive-1',
    name: 'Memory.jpg',
    mimeType: 'image/jpeg',
    size: '1024',
    modifiedTime: '2026-07-21T12:00:00.000Z',
    sha256Checksum: 'ABC123',
    version: '7',
  });
  assert.equal(asset.supported, true);
  assert.equal(asset.providerChecksum.algorithm, 'sha256');
  assert.equal(resolveCloudAssetImportState(null, asset), CLOUD_ASSET_STATES.AVAILABLE);
  assert.equal(
    resolveCloudAssetImportState(
      { importState: CLOUD_ASSET_STATES.SAFE, providerVersion: '7' },
      asset,
    ),
    CLOUD_ASSET_STATES.SAFE,
  );
  assert.equal(
    resolveCloudAssetImportState(
      { importState: CLOUD_ASSET_STATES.SAFE, providerVersion: '6' },
      asset,
    ),
    CLOUD_ASSET_STATES.AVAILABLE,
  );
});

test('Operational metrics merge safely and create Mongo increment paths', () => {
  const metrics = mergeSyncMetrics(
    { providerApiCalls: 2, bytesDownloaded: 100 },
    { providerApiCalls: 1, providerChecksumSkips: 3 },
  );
  assert.equal(metrics.providerApiCalls, 3);
  assert.equal(metrics.bytesDownloaded, 100);
  assert.equal(metrics.providerChecksumSkips, 3);
  assert.deepEqual(metricsIncrementPatch(metrics), {
    'syncMetrics.providerApiCalls': 3,
    'syncMetrics.providerChecksumSkips': 3,
    'syncMetrics.bytesDownloaded': 100,
  });
});

test('New Smart Sync jobs start with cursor and metric checkpoints', () => {
  const job = createSmartSyncJob({
    userId: 'user-1',
    providerId: 'google_drive',
    profile: { rules: [] },
  });
  assert.equal(job.discoveryPageToken, null);
  assert.equal(job.pendingNewStartPageToken, null);
  assert.equal(job.metrics.providerApiCalls, 0);
  assert.equal(job.metrics.bytesStored, 0);
});
