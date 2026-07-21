import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmartSyncJob, jobProgress, nextJobState, normalizeSourceFileIds } from '../lib/smart-sync/jobs.js';
import { buildNativeUploadPlan, validateNativeManifest } from '../lib/smart-sync/native-bridge.js';

test('Smart Sync source IDs are unique and capped', () => {
  const ids = normalizeSourceFileIds(['a', 'a', 'b', '', null], 2);
  assert.deepEqual(ids, ['a', 'b']);
});

test('Smart Sync jobs use durable counters and safe transitions', () => {
  const job = createSmartSyncJob({ userId: 'u1', providerId: 'google_drive', profile: { rules: [] }, sourceFileIds: ['a', 'b'] });
  assert.equal(job.estimatedItems, 2);
  assert.equal(job.activeKey, 'u1:google_drive');
  assert.equal(jobProgress({ ...job, processedItems: 1 }).percent, 50);
  assert.equal(nextJobState({ status: 'running' }, 'pause').status, 'paused');
  assert.equal(nextJobState({ status: 'completed' }, 'resume'), null);
});

test('Native manifests enforce the 500-item contract', () => {
  assert.throws(() => validateNativeManifest({ provider: 'ios_photos', assets: Array.from({ length: 501 }, (_, index) => ({ localId: index })) }));
});

test('Native plans honor ordered rules, duplicates, and capacity', () => {
  const manifest = validateNativeManifest({
    provider: 'ios_photos',
    deviceId: 'device-1',
    assets: [
      { localId: 'recent-video', kind: 'video', size: 5, createdAt: new Date(), checksum: 'v1' },
      { localId: 'favorite-photo', kind: 'photo', size: 4, favorite: true, createdAt: '2020-01-01', checksum: 'p1' },
      { localId: 'duplicate', kind: 'photo', size: 1, checksum: 'dup' },
    ],
  });
  const profile = {
    rules: [
      { type: 'favorites', enabled: true, priority: 1, targetIds: [] },
      { type: 'recent', enabled: true, priority: 2, targetIds: [] },
      { type: 'everything', enabled: true, priority: 3, targetIds: [] },
    ],
  };
  const plan = buildNativeUploadPlan({ profile, manifest, remainingBytes: 5, duplicateChecksums: ['dup'] });
  assert.equal(plan.selected[0].localId, 'favorite-photo');
  assert.equal(plan.selected.length, 1);
  assert.equal(plan.duplicateCount, 1);
  assert.equal(plan.capacityReached, true);
});
