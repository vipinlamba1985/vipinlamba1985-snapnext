import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FACE_DELETE_STORE_KEYS, FACE_DELETION_INVENTORY } from '../lib/face-deletion-inventory.js';

const read = (path) => fs.readFileSync(path, 'utf8');

test('M7 inventory keeps local media_analysis outside cloud deletion while naming every cloud reference store', () => {
  const byKey = new Map(FACE_DELETION_INVENTORY.map((row) => [row.key, row]));
  assert.equal(byKey.get('media_analysis')?.classification, 'retain_cloud_delete');
  for (const key of [
    'rekognition_collection',
    'face_index',
    'person_clusters',
    'media.peopleIntelligence',
    'magic_library_activation.active',
    'media.userConfirmedPeople',
    'upload_reservations.assignedPeople',
  ]) assert.ok(FACE_DELETE_STORE_KEYS.includes(key), `${key} must be in verified cloud deletion`);
});

test('verified deletion inspects AWS after delete and verifies all SnapNext delete stores', () => {
  const worker = read('lib/face-deletion-worker.server.js');
  const deleteAt = worker.indexOf('deleteRekognitionCollection(collectionId)');
  const inspectAt = worker.indexOf('verifyRekognitionCollectionAbsent(collectionId)');
  const dbVerifyAt = worker.indexOf('verifySnapNextFaceRecognitionStateDeleted({ db, userId })');
  const verifiedAt = worker.indexOf("status: 'verified_deleted'");
  assert.ok(deleteAt > 0);
  assert.ok(inspectAt > deleteAt, 'AWS collection inspection must happen after deletion');
  assert.ok(dbVerifyAt > deleteAt, 'SnapNext inventory verification must happen after deletion');
  assert.ok(verifiedAt > inspectAt && verifiedAt > dbVerifyAt, 'verified_deleted must be written only after both verification paths');
});

test('deletion worker has no recognition-producing operation', () => {
  const worker = read('lib/face-deletion-worker.server.js');
  assert.doesNotMatch(worker, /CreateCollection|IndexFaces|CreateUser|AssociateFaces|SearchUsers/);
  assert.match(worker, /deleteCollection/);
  assert.match(worker, /describeCollection/);
});

test('worker state writes are generation and worker owned', () => {
  const worker = read('lib/face-deletion-worker.server.js');
  assert.match(worker, /\{ userId, generation, workerId/);
  assert.match(worker, /status: 'pending'/);
  assert.match(worker, /status: 'processing'/);
  assert.match(worker, /status: 'verifying'/);
  assert.match(worker, /face_deletion_stale_worker/);
  assert.doesNotMatch(worker, /updateOne\(\s*\{ userId \},\s*\{\s*\$set:\s*\{\s*status: 'verified_deleted'/s);
});

test('failed deletion blocks cloud regrant but remains retryable on the same generation', () => {
  const consent = read('app/api/settings/face-processing-consent/route.js');
  const deletion = read('app/api/settings/face-processing-consent/deletion/route.js');
  const worker = read('lib/face-deletion-worker.server.js');
  assert.match(consent, /face_deletion_needs_retry/);
  assert.match(deletion, /method|PATCH/);
  assert.match(worker, /requeueFailedFaceDeletion/);
  assert.match(worker, /generation: requeued\.generation/);
});

test('a verified deletion becomes historical after a later cloud-recognition grant', () => {
  const consent = read('app/api/settings/face-processing-consent/route.js');
  assert.match(consent, /currentLifecycleDeletionRequest/);
  assert.match(consent, /grantedAt > verifiedAt/);
  assert.match(consent, /that old success.*historical/s);
});

test('repeated deletion request does not create a new generation while one is active', () => {
  const worker = read('lib/face-deletion-worker.server.js');
  assert.match(worker, /ACTIVE_STATUSES\.includes\(existing\.status\).*created: false/s);
  assert.match(worker, /existing\?\.status === 'failed'.*created: false/s);
  assert.match(worker, /generation = Math\.max\(1, Number\(existing\?\.generation \|\| 0\) \+ 1\)/);
});

test('recovery cron uses the existing CRON_SECRET boundary and server worker', () => {
  const cron = read('app/api/cron/face-deletion-recovery/route.js');
  const vercel = read('vercel.json');
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /recoverFaceDeletionRequests/);
  assert.match(vercel, /face-deletion-recovery/);
});

test('failed deletion creates one privacy-safe actionable notification per generation', () => {
  const notifications = read('lib/face-deletion-notifications.server.js');
  const worker = read('lib/face-deletion-worker.server.js');
  const bell = read('components/NotificationBell.js');
  assert.match(notifications, /privacy-deletion-retry:/);
  assert.match(notifications, /\$setOnInsert/);
  assert.match(notifications, /Action needed in SnapNext privacy settings/);
  assert.match(notifications, /href: '\/privacy-security'/);
  assert.match(worker, /publishFaceDeletionRetryNotification/);
  assert.match(worker, /clearFaceDeletionRetryNotification/);
  assert.match(bell, /privacy_action_required/);
  assert.match(bell, /router\.push\(href\)/);
});

test('Privacy & security is authoritative and reachable through More while Library only deep-links', () => {
  const page = read('app/(app)/privacy-security/page.js');
  const controls = read('components/privacy/FacePrivacyControls.js');
  const library = read('components/magic-library/PeopleFaceConsent.js');
  const shell = read('components/AppShell.js');
  assert.match(page, /FacePrivacyControls/);
  assert.match(controls, /local-face-detection-consent/);
  assert.match(controls, /face-processing-consent\/deletion/);
  assert.match(controls, /Deletion verified/);
  assert.match(library, /href="\/privacy-security"/);
  assert.doesNotMatch(library, /method: 'POST'|method: 'DELETE'/);
  assert.match(shell, /\{ href: '\/privacy-security', label: 'Privacy & security'/);
  assert.match(shell, /MORE_HREFS[\s\S]*'\/privacy-security'/);
  const primary = shell.match(/const PRIMARY_HREFS = \[([^\]]*)\]/)?.[1] || '';
  assert.doesNotMatch(primary, /privacy-security/, 'Privacy & security belongs under More, not primary navigation');
});

test('Add asks local face consent only at Back up and allows backup without local detection', () => {
  const flow = read('app/(app)/upload/discover/DiscoveryFlow.js');
  const promptAt = flow.indexOf("setLocalConsentPrompt(true)");
  const protectAt = flow.indexOf('await runProtection();', promptAt);
  assert.match(flow, /upload-local-face-consent/);
  assert.match(flow, /Enable on-device detection & back up/);
  assert.match(flow, /Back up without face detection/);
  assert.match(flow, /does not enable cloud face recognition/);
  assert.match(flow, /flow\.report\.photos > 0/);
  assert.ok(promptAt > 0 && protectAt > promptAt, 'local consent choice must happen before protection starts');
  assert.doesNotMatch(flow, /face-processing-consent[^/]/, 'Add must not grant cloud recognition');
});
