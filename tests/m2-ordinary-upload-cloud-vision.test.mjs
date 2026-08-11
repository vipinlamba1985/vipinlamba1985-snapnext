import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const CLOUD_FACE_CALL = /@aws-sdk\/client-rekognition|new\s+(?:IndexFaces|DetectFaces)Command|peopleRekognition\./;

test('ordinary protected backup commit never calls cloud AI or Rekognition', () => {
  const commit = read('lib/protection-commit.js');
  assert.doesNotMatch(commit, /@\/lib\/gemini|\banalyzeImage\s*\(|\banalyzeVideo\s*\(/);
  assert.doesNotMatch(commit, /reserveExternalAiSpend\s*\(|settleExternalAiSpend\s*\(|releaseExternalAiSpend\s*\(/);
  assert.doesNotMatch(commit, CLOUD_FACE_CALL);
  assert.match(commit, /aiAnalysis: null/);
  assert.match(commit, /ordinary backup commits never call Gemini/);
});

test('ordinary backup client only starts optional local MediaPipe analysis, not cloud recognition', () => {
  const run = read('lib/protection-run.js');
  const upload = read('lib/protection-upload-one.js');
  const local = read('lib/intelligence/web-face-analysis.js');
  assert.match(run, /uploadOneProtectedItem/);
  assert.match(upload, /buildWebFaceAnalysisIfEnabled/);
  assert.doesNotMatch(upload, CLOUD_FACE_CALL);
  assert.doesNotMatch(upload, /@\/lib\/gemini/);
  assert.doesNotMatch(local, CLOUD_FACE_CALL);
  assert.doesNotMatch(local, /@\/lib\/gemini/);
});

test('cloud People recognition remains behind its independent server consent gate', () => {
  const reindex = read('app/api/magic-library/people/reindex/route.js');
  const gate = read('lib/intelligence/face-gate.js');
  assert.match(reindex, /face_processing_consent_required/);
  assert.match(reindex, /hasFaceProcessingConsent/);
  assert.match(gate, /cloudFaceRecognitionConsent/);
  assert.match(gate, /awaiting_consent/);
});
