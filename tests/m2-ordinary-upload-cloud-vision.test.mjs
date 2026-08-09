import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('ordinary protected backup commit never calls cloud AI or Rekognition', () => {
  const commit = read('lib/protection-commit.js');
  assert.doesNotMatch(commit, /@\/lib\/gemini|analyzeImage|analyzeVideo/);
  assert.doesNotMatch(commit, /reserveExternalAiSpend|settleExternalAiSpend|releaseExternalAiSpend/);
  assert.doesNotMatch(commit, /Rekognition|IndexFaces|DetectFaces/);
  assert.match(commit, /aiAnalysis: null/);
  assert.match(commit, /ordinary backup commits never call Gemini/);
});

test('ordinary backup client only starts optional local MediaPipe analysis, not cloud recognition', () => {
  const run = read('lib/protection-run.js');
  const upload = read('lib/protection-upload-one.js');
  const local = read('lib/intelligence/web-face-analysis.js');
  assert.match(run, /uploadOneProtectedItem/);
  assert.match(upload, /buildWebFaceAnalysisIfEnabled/);
  assert.doesNotMatch(upload, /Rekognition|IndexFaces|@aws-sdk\/client-rekognition|@\/lib\/gemini/);
  assert.doesNotMatch(local, /Rekognition|IndexFaces|@aws-sdk\/client-rekognition|@\/lib\/gemini/);
});

test('cloud People recognition remains behind its independent server consent gate', () => {
  const reindex = read('app/api/magic-library/people/reindex/route.js');
  const gate = read('lib/intelligence/face-gate.js');
  assert.match(reindex, /face_processing_consent_required/);
  assert.match(reindex, /hasFaceProcessingConsent/);
  assert.match(gate, /cloudFaceRecognitionConsent/);
  assert.match(gate, /awaiting_consent/);
});
