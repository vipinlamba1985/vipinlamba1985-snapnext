import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CLOUD_FACE_RECOGNITION_CONSENT_VERSION,
  FACE_PROCESSING_CONSENT_VERSION,
  LOCAL_FACE_DETECTION_CONSENT_VERSION,
  MAGIC_ANALYSIS_VERSION,
  intelligenceConfig,
} from '../lib/intelligence/config.js';
import { evaluateFaceGate, hasFaceProcessingConsent, hasLocalFaceDetectionConsent } from '../lib/intelligence/face-gate.js';

const read = (path) => fs.readFileSync(path, 'utf8');
const analysis = { analysisVersion: MAGIC_ANALYSIS_VERSION, faceCount: 2 };
const consented = {
  cloudFaceRecognitionConsent: {
    granted: true,
    version: CLOUD_FACE_RECOGNITION_CONSENT_VERSION,
    grantedAt: new Date(),
    deletionState: 'none',
  },
};

test('all rollout switches default off while both consent domains stay required', () => {
  const config = intelligenceConfig({});
  assert.equal(config.magicSorterEnabled, false);
  assert.equal(config.faceProcessingEnabled, false);
  assert.equal(config.localFaceGateEnabled, false);
  assert.equal(config.consentRequired, true);
  assert.equal(config.localConsentRequired, true);
  const result = evaluateFaceGate({ analysis, user: consented, config });
  assert.equal(result.eligible, false);
  assert.equal(result.status, 'face_gate_disabled');
});

test('local and cloud consent states are independent', () => {
  const user = {
    localFaceDetectionConsent: {
      granted: true,
      version: LOCAL_FACE_DETECTION_CONSENT_VERSION,
      grantedAt: new Date(),
    },
  };
  assert.equal(hasLocalFaceDetectionConsent(user), true);
  assert.equal(hasFaceProcessingConsent(user), false);

  const cloudOnly = consented;
  assert.equal(hasFaceProcessingConsent(cloudOnly), true);
  assert.equal(hasLocalFaceDetectionConsent(cloudOnly), false);
});

test('legacy M0/M1 cloud consent remains readable during migration', () => {
  assert.equal(hasFaceProcessingConsent({
    faceProcessingConsent: {
      granted: true,
      version: FACE_PROCESSING_CONSENT_VERSION,
      grantedAt: new Date(),
      deletionState: 'none',
    },
  }), true);
});

test('pending, processing, verifying and failed deletion states block cloud recognition', () => {
  for (const deletionState of ['pending', 'processing', 'verifying', 'failed']) {
    assert.equal(hasFaceProcessingConsent({
      cloudFaceRecognitionConsent: { ...consented.cloudFaceRecognitionConsent, deletionState },
    }), false);
  }
});

test('cloud revoke is separate from stored-data deletion', () => {
  const route = read('app/api/settings/face-processing-consent/route.js');
  assert.match(route, /M7 separates revoke from delete/);
  assert.doesNotMatch(route, /reason: 'consent_revoked'/);
  assert.doesNotMatch(route, /\$inc:\s*\{\s*generation:/);
  assert.match(route, /deletionQueued: false/);
  assert.match(route, /cloudFaceRecognitionConsent\.granted': false/);

  const deletion = read('app/api/settings/face-processing-consent/deletion/route.js');
  assert.match(deletion, /createFaceDeletionRequest/);
  assert.match(deletion, /processFaceDeletionForUser/);
});

test('regrant cannot bypass unresolved deletion or dormant rollout', () => {
  const route = read('app/api/settings/face-processing-consent/route.js');
  assert.match(route, /deletionBlocksCloudRegrant/);
  assert.match(route, /face_deletion_needs_retry/);
  assert.match(route, /face_deletion_pending/);
  assert.match(route, /people_rollout_disabled/);
});

test('Magic V1 exposes no face surface and privacy enforcement lives in the manifest GET path', () => {
  const page = read('app/(app)/gallery/magic/page.js');
  const manifestRoute = read('app/api/magic-library/manifest/route.js');
  const server = read('lib/magic-manifest.server.js');

  assert.doesNotMatch(page, /PeopleFaceConsent|PeopleMagicBootstrap|PeopleLocalAnalysisBackfill|MagicLibraryGalleryMagic/);
  assert.match(manifestRoute, /readMagicManifestForUser/);
  assert.match(manifestRoute, /private, no-store/);
  assert.match(server, /faceCardsAllowedForState/);
  assert.match(server, /face_deletion_requests/);
});

test('local analysis config is gated by independent local consent', () => {
  const route = read('app/api/media/analysis/config/route.js');
  assert.match(route, /localFaceDetectionConsent/);
  assert.match(route, /hasLocalFaceDetectionConsent/);
  assert.match(route, /consentReady/);
});

test('Favourite reindex blocks when rollout, plan, selection or cloud consent is unavailable', () => {
  const route = read('app/api/magic-library/people/reindex/route.js');
  assert.match(route, /people_rollout_disabled/);
  assert.match(route, /favorite_people_plan_required/);
  assert.match(route, /favorite_people_required/);
  assert.match(route, /favorite_reference_required/);
  assert.match(route, /face_processing_consent_required/);
  const block = route.indexOf('const blocked = await processingBlock');
  const rebuild = route.indexOf('await rebuildFavoritePeopleRecognition');
  assert.ok(block > 0 && rebuild > block, 'server readiness check must run before Favourite People work');
  assert.doesNotMatch(route, /rebuildPeopleIntelligence/);
});

test('face deletion queue remains unique and recovery-indexed per user', () => {
  const db = read('lib/db.js');
  assert.match(db, /collection\('face_deletion_requests'\)\.createIndex\(\{ userId: 1 \}, \{ unique: true \}\)/);
  assert.match(db, /status: 1, nextRetryAt: 1, leaseExpiresAt: 1/);
});
