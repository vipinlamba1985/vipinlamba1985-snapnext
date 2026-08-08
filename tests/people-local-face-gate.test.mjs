import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateFaceGate } from '../lib/intelligence/face-gate.js';
import { FACE_PROCESSING_CONSENT_VERSION, MAGIC_ANALYSIS_VERSION } from '../lib/intelligence/config.js';

const read = (path) => fs.readFileSync(path, 'utf8');
const config = {
  faceProcessingEnabled: true,
  localFaceGateEnabled: true,
  consentRequired: true,
  minFaceCountForAws: 1,
  maxAutomaticFacesForAws: 4,
  maxIndexedFacesPerPhoto: 15,
};
const consented = {
  faceProcessingConsent: {
    granted: true,
    version: FACE_PROCESSING_CONSENT_VERSION,
    grantedAt: new Date(),
  },
};
const analysis = (faceCount) => ({ analysisVersion: MAGIC_ANALYSIS_VERSION, faceCount });

test('missing or stale local analysis defers instead of guessing', () => {
  assert.deepEqual(evaluateFaceGate({ analysis: null, user: consented, config }), {
    eligible: false,
    deferred: true,
    status: 'awaiting_analysis',
    reason: 'local_analysis_missing',
    faceCount: null,
  });
  const stale = evaluateFaceGate({ analysis: { analysisVersion: 'old', faceCount: 0 }, user: consented, config });
  assert.equal(stale.status, 'awaiting_analysis');
  assert.equal(stale.eligible, false);
});

test('zero faces is terminal and never requires consent', () => {
  const result = evaluateFaceGate({ analysis: analysis(0), user: {}, config });
  assert.equal(result.eligible, false);
  assert.equal(result.terminal, true);
  assert.equal(result.status, 'no_faces');
  assert.equal(result.faceCount, 0);
});

test('one through four faces are eligible only with recorded consent', () => {
  for (const faceCount of [1, 2, 3, 4]) {
    const blocked = evaluateFaceGate({ analysis: analysis(faceCount), user: {}, config });
    assert.equal(blocked.status, 'awaiting_consent');
    assert.equal(blocked.eligible, false);

    const allowed = evaluateFaceGate({ analysis: analysis(faceCount), user: consented, config });
    assert.equal(allowed.status, 'eligible');
    assert.equal(allowed.eligible, true);
    assert.equal(allowed.faceCount, faceCount);
  }
});

test('five or more faces are terminal group photos with no AWS eligibility', () => {
  for (const faceCount of [5, 10, 30]) {
    const result = evaluateFaceGate({ analysis: analysis(faceCount), user: {}, config });
    assert.equal(result.eligible, false);
    assert.equal(result.terminal, true);
    assert.equal(result.status, 'group_photo');
    assert.equal(result.reason, 'large_group_photo');
  }
});

test('the people indexer evaluates the local gate before every AWS entry point', () => {
  const source = read('lib/people-intelligence.server.js');
  const gateAt = source.indexOf('const gate = await localFaceGateForMedia');
  const collectionAt = source.indexOf('const collectionId = await ensureCollection(userId)', gateAt);
  const indexAt = source.indexOf('new IndexFacesCommand', gateAt);
  assert.ok(gateAt > 0, 'trusted local face gate must exist');
  assert.ok(collectionAt > gateAt, 'collection access must happen after the local gate');
  assert.ok(indexAt > gateAt, 'IndexFaces must happen after the local gate');
  assert.doesNotMatch(
    source.slice(source.indexOf('export async function rebuildPeopleIntelligence'), source.length),
    /await ensureCollection\(userId\)/,
    'batch rebuild must not touch AWS before per-media gating',
  );
});

test('crowd fallback deletes newly indexed vectors before identity matching', () => {
  const source = read('lib/people-intelligence.server.js');
  const crowdAt = source.indexOf('isLargeGroupPhoto(usableFaces.length)');
  const deleteAt = source.indexOf('await deleteIndexedFaces(collectionId, groupFaceIds)', crowdAt);
  const searchAt = source.indexOf('await findExistingCluster(', crowdAt);
  assert.ok(deleteAt > crowdAt);
  assert.ok(searchAt > deleteAt);
});
