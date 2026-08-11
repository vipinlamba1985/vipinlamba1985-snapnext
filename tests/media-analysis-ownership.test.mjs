import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeMediaAnalysisPayload } from '../lib/intelligence/media-analysis.js';
import { MAGIC_ANALYSIS_VERSION } from '../lib/intelligence/config.js';

const read = (path) => fs.readFileSync(path, 'utf8');

function payload(overrides = {}) {
  return {
    version: MAGIC_ANALYSIS_VERSION,
    platform: 'web',
    faceCount: 2,
    faceDetectionConfidence: 0.95,
    isScreenshot: false,
    screenshotConfidence: 0,
    isDocument: false,
    documentType: null,
    documentConfidence: 0,
    ocrCharacterCount: 0,
    textDensity: 0,
    isSensitive: false,
    ...overrides,
  };
}

test('Magic Sorter contract normalizes a valid payload', () => {
  const normalized = normalizeMediaAnalysisPayload(payload());
  assert.equal(normalized.analysisVersion, MAGIC_ANALYSIS_VERSION);
  assert.equal(normalized.platform, 'web');
  assert.equal(normalized.faceCount, 2);
  assert.equal(normalized.isScreenshot, false);
  assert.equal(normalized.isDocument, false);
});

test('Magic Sorter contract rejects unknown versions and invalid face counts', () => {
  assert.throws(() => normalizeMediaAnalysisPayload(payload({ version: 'unknown' })), /Unsupported analysis version/);
  assert.throws(() => normalizeMediaAnalysisPayload(payload({ faceCount: -1 })), /faceCount/);
  assert.throws(() => normalizeMediaAnalysisPayload(payload({ faceCount: 1.5 })), /faceCount/);
});

test('analysis route derives ownership from auth and never accepts client userId or storageKey', () => {
  const source = read('app/api/media/[id]/analysis/route.js');
  assert.match(source, /getUserFromRequest\(request\)/);
  assert.ok(source.split('userId: user.id').length - 1 >= 5, 'all media/analysis queries must scope to the authenticated user');
  assert.doesNotMatch(source, /body\.userId|body\?\.userId|body\['userId'\]/);
  assert.doesNotMatch(source, /body\.storageKey|body\?\.storageKey|body\['storageKey'\]/);
  assert.match(source, /Memory not found/);
});

test('Mongo index setup includes the local analysis access paths', () => {
  const source = read('lib/db.js');
  assert.match(source, /collection\('media_analysis'\)\.createIndex\(\{ mediaId: 1 \}, \{ unique: true \}\)/);
  assert.match(source, /collection\('media_analysis'\)\.createIndex\(\{ userId: 1, faceCount: 1 \}\)/);
  assert.match(source, /isScreenshot: 1/);
  assert.match(source, /isDocument: 1, documentType: 1/);
});
