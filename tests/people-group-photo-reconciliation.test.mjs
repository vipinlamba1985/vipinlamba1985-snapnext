import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GROUP_PHOTO_STATUS,
  chooseRepresentativeFace,
  isUserProtectedCluster,
  needsGroupPhotoReconciliation,
  planClusterRepair,
  storedFaceCount,
  summarizeReconciliation,
} from '../lib/people-group-photo-reconciliation.js';

const read = (path) => fs.readFileSync(path, 'utf8');
/** Source with comments removed, so assertions test code and not prose. */
const readCode = (path) => read(path)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const media = (faces, patch = {}) => ({
  id: 'm1',
  peopleIntelligence: {
    faceIds: Array.from({ length: faces }, (_, i) => `f${i}`),
    clusterIds: Array.from({ length: faces }, (_, i) => `c${i}`),
    status: 'completed',
    ...patch,
  },
});

test('only crowd photos that still attach identities need reconciliation', () => {
  assert.equal(needsGroupPhotoReconciliation(media(5)), true);
  assert.equal(needsGroupPhotoReconciliation(media(12)), true);
  // Family-sized and smaller were always legitimate.
  assert.equal(needsGroupPhotoReconciliation(media(4)), false);
  assert.equal(needsGroupPhotoReconciliation(media(1)), false);
});

test('reconciliation is idempotent', () => {
  // Already reconciled: correct status and no cluster attachments left.
  const done = media(9, { status: GROUP_PHOTO_STATUS, clusterIds: [] });
  assert.equal(needsGroupPhotoReconciliation(done), false);
  // A crowd photo with no attachments needs nothing even if status lags.
  assert.equal(needsGroupPhotoReconciliation(media(9, { clusterIds: [] })), false);
});

test('face count prefers the recorded count and falls back to stored ids', () => {
  assert.equal(storedFaceCount(media(6)), 6);
  assert.equal(storedFaceCount(media(6, { detectedFaceCount: 11 })), 11);
  assert.equal(storedFaceCount({}), 0);
  // Duplicate ids must not inflate the count into a false crowd.
  assert.equal(storedFaceCount({ peopleIntelligence: { faceIds: ['a', 'a', 'b'] } }), 2);
});

test('identities the user invested in are protected from automatic hiding', () => {
  assert.equal(isUserProtectedCluster({ isSelf: true }), true);
  assert.equal(isUserProtectedCluster({ restoredAt: new Date() }), true);
  assert.equal(isUserProtectedCluster({ displayName: 'Grandma' }), true);
  assert.equal(isUserProtectedCluster({ verificationStatus: 'confirmed' }), true);
  assert.equal(isUserProtectedCluster({ clusterId: 'c1' }, ['c1']), true, 'active people are protected');

  // Auto-discovered, unnamed, never confirmed.
  assert.equal(isUserProtectedCluster({ clusterId: 'c9', displayName: null }), false);
  assert.equal(isUserProtectedCluster({ clusterId: 'c9', displayName: 'Add name' }), false);
});

test('a cluster with no legitimate evidence left is hidden, not deleted', () => {
  const plan = planClusterRepair({ cluster: { clusterId: 'c9' }, remainingFaces: [] });
  assert.equal(plan.action, 'hide');
  assert.equal(plan.reason, 'no_remaining_evidence');
});

test('a protected cluster is never hidden even with no evidence left', () => {
  const plan = planClusterRepair({ cluster: { clusterId: 'c1', displayName: 'Dad' }, remainingFaces: [] });
  assert.equal(plan.action, 'keep_protected');
  assert.equal(plan.protected, true);
});

test('a thumbnail taken from a group photo is repointed to the best remaining face', () => {
  const plan = planClusterRepair({
    cluster: { clusterId: 'c1', representativeMediaId: 'crowd-photo' },
    remainingFaces: [
      { faceId: 'f1', mediaId: 'solo-a', quality: 40 },
      { faceId: 'f2', mediaId: 'solo-b', quality: 91 },
      { faceId: 'f3', mediaId: 'solo-c', quality: 65 },
    ],
  });
  assert.equal(plan.action, 'repoint_representative');
  assert.equal(plan.representative.mediaId, 'solo-b', 'highest quality wins');
});

test('a still-valid thumbnail is left alone', () => {
  const plan = planClusterRepair({
    cluster: { clusterId: 'c1', representativeMediaId: 'solo-a' },
    remainingFaces: [{ faceId: 'f1', mediaId: 'solo-a', quality: 40 }],
  });
  assert.equal(plan.action, 'keep');
  assert.equal(plan.representative, null);
});

test('representative selection ignores unusable rows', () => {
  assert.equal(chooseRepresentativeFace([]), null);
  assert.equal(chooseRepresentativeFace([{ quality: 99 }]), null, 'needs faceId and mediaId');
  assert.equal(chooseRepresentativeFace([{ faceId: 'f', mediaId: 'm', quality: 5 }]).mediaId, 'm');
});

test('the reconciliation report counts cluster outcomes', () => {
  const summary = summarizeReconciliation([
    { action: 'repoint_representative' },
    { action: 'hide' },
    { action: 'hide' },
    { action: 'keep_protected' },
    { action: 'keep' },
  ]);
  assert.equal(summary.clustersInspected, 5);
  assert.equal(summary.clustersRepointed, 1);
  assert.equal(summary.clustersHidden, 2);
  assert.equal(summary.clustersProtected, 1);
});

test('reconciliation never deletes media and never calls Rekognition', () => {
  const server = readCode('lib/people-group-photo-reconciliation.server.js');
  // Media documents are only ever updated, never removed or trashed.
  assert.doesNotMatch(server, /collection\('media'\)\s*\.?\s*\.(deleteOne|deleteMany|drop)/);
  assert.doesNotMatch(server, /trashed:\s*true/);
  // No AWS client is imported or invoked anywhere in the executable code.
  assert.doesNotMatch(server, /rekognition|Rekognition|IndexFaces|SearchUsers/);
  // The only deletes target derived face rows, which are rebuildable.
  assert.match(server, /db\.collection\('face_index'\)\.deleteMany\(\{ userId, faceId: \{ \$in: faceIds \} \}\)/);
});

test('every reconciliation query is scoped to the authenticated user', () => {
  const server = read('lib/people-group-photo-reconciliation.server.js');
  const collectionCalls = server.match(/db\.collection\('[a-z_]+'\)[\s\S]{0,140}?[),]\n/g) || [];
  assert.ok(collectionCalls.length >= 5, 'expected several database calls to inspect');
  for (const call of collectionCalls) {
    assert.match(call, /userId/, `unscoped query found: ${call.slice(0, 80)}`);
  }
});

test('the cleanup is bounded and never runs unattended', () => {
  const server = read('lib/people-group-photo-reconciliation.server.js');
  assert.match(server, /const MAX_BATCH = \d+/);
  assert.match(server, /Math\.min\(MAX_BATCH/);
  assert.match(server, /\.limit\(batchSize\)/);

  // The client exposes it as an explicit action only — no effect, no timer.
  const bootstrap = read('components/magic-library/PeopleMagicBootstrap.js');
  assert.match(bootstrap, /onClick=\{runGroupPhotoCleanup\}/);
  assert.doesNotMatch(bootstrap, /setTimeout\(\(\) => runGroupPhotoCleanup/);
});

test('the cleanup route requires authentication and reports remaining work', () => {
  const route = read('app/api/magic-library/people/reconcile-group-photos/route.js');
  assert.match(route, /const user = await getUserFromRequest\(request\)/);
  assert.match(route, /if \(!user\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/);
  // The read path reports only; it must not mutate.
  const getBody = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
  assert.doesNotMatch(getBody, /reconcileGroupPhotoClusters/);
  assert.match(getBody, /countPendingGroupPhotoCleanup/);
});
