import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { intelligenceConfig, FACE_PROCESSING_CONSENT_VERSION, MAGIC_ANALYSIS_VERSION } from '../lib/intelligence/config.js';
import { evaluateFaceGate, hasFaceProcessingConsent } from '../lib/intelligence/face-gate.js';

const read = (path) => fs.readFileSync(path, 'utf8');

const analysis = { analysisVersion: MAGIC_ANALYSIS_VERSION, faceCount: 2 };
const consented = {
  faceProcessingConsent: {
    granted: true,
    version: FACE_PROCESSING_CONSENT_VERSION,
    grantedAt: new Date(),
    deletionState: 'none',
  },
};

test('all rollout switches default off while consent stays required', () => {
  const config = intelligenceConfig({});
  assert.equal(config.magicSorterEnabled, false);
  assert.equal(config.faceProcessingEnabled, false);
  assert.equal(config.localFaceGateEnabled, false);
  assert.equal(config.consentRequired, true);
  const result = evaluateFaceGate({ analysis, user: consented, config });
  assert.equal(result.eligible, false);
  assert.equal(result.status, 'face_gate_disabled');
  assert.equal(result.reason, 'magic_sorter_disabled');
});

test('pending deletion invalidates an otherwise valid face-processing grant', () => {
  const user = {
    faceProcessingConsent: {
      ...consented.faceProcessingConsent,
      deletionState: 'pending',
    },
  };
  assert.equal(hasFaceProcessingConsent(user), false);
});

test('consent revoke queues deletion and never claims immediate deletion', () => {
  const route = read('app/api/settings/face-processing-consent/route.js');
  assert.match(route, /face_deletion_requests/);
  assert.match(route, /status: 'pending'/);
  assert.match(route, /reason: 'consent_revoked'/);
  assert.match(route, /faceProcessingConsent\.granted': false/);
  assert.match(route, /faceProcessingConsent\.deletionState': 'pending'/);
  assert.match(route, /verifiedAt: null/);
  assert.match(route, /never claims deletion is\s*\n?\/\/ complete/i);
});

test('regrant cannot silently cancel pending deletion', () => {
  const route = read('app/api/settings/face-processing-consent/route.js');
  assert.match(route, /face_deletion_pending/);
  assert.match(route, /verified deletion completes/);
  assert.match(route, /status: \{ \$in: \['pending', 'processing'\] \}/);
});

test('Magic Library surfaces granted, off and pending-deletion consent states', () => {
  const page = read('app/(app)/gallery/magic/page.js');
  const component = read('components/magic-library/PeopleFaceConsent.js');
  assert.match(page, /<PeopleFaceConsent \/>/);
  assert.match(component, /Enable People recognition/);
  assert.match(component, /Turn off & queue deletion/);
  assert.match(component, /Face-data deletion is pending/);
  assert.match(component, /will not label this data deleted until verification succeeds/);
});

test('face deletion queue has indexes for the future M7 worker', () => {
  const db = read('lib/db.js');
  assert.match(db, /collection\('face_deletion_requests'\)\.createIndex\(\{ status: 1, requestedAt: 1 \}\)/);
  assert.match(db, /collection\('face_deletion_requests'\)\.createIndex\(\{ userId: 1, status: 1, requestedAt: -1 \}\)/);
});
