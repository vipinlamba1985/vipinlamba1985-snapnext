import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('web producer uses pinned self-hosted MediaPipe face detection assets', () => {
  const worker = read('public/workers/magic-face-worker.js');
  assert.match(worker, /MEDIAPIPE_VERSION = '1\.0\.0'/);
  assert.match(worker, /\/vendor\/mediapipe\/tasks-vision\//);
  assert.match(worker, /blaze_face_full_range/);
  assert.match(worker, /FaceDetector\.createFromOptions/);
  assert.match(worker, /detector\.detect\(bitmap\)/);
  assert.doesNotMatch(worker, /https?:\/\//, 'worker must not fetch runtime, wasm, or model from a remote origin');
  assert.doesNotMatch(worker, /cdn\.jsdelivr|storage\.googleapis/);
  assert.doesNotMatch(worker, /Rekognition|DetectFacesCommand|IndexFacesCommand/);

  const prep = read('scripts/prepare-mediapipe-assets.mjs');
  assert.match(prep, /tasks-vision@\$\{VERSION\}\/vision_bundle\.mjs/);
  assert.match(prep, /blaze_face_full_range\/float16\/1\/blaze_face_full_range\.tflite/);
  assert.match(prep, /public', 'vendor', 'mediapipe', 'tasks-vision', VERSION/);
  const nextConfig = read('next.config.js');
  assert.match(nextConfig, /prepare-mediapipe-assets\.mjs/);
});

test('web analysis persists face count through the authenticated media analysis API', () => {
  const client = read('lib/intelligence/web-face-analysis.js');
  assert.match(client, /platform: 'web'/);
  assert.match(client, /faceCount: Number\(result\.faceCount/);
  assert.match(client, /apiFetch\(`\/media\/\$\{encodeURIComponent\(mediaId\)\}\/analysis`/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.match(client, /\/media\/analysis\/config/);
});

test('new web photo uploads start local analysis in the upload path without delaying backup completion', () => {
  const upload = read('lib/protection-upload-one.js');
  const start = upload.indexOf('buildWebFaceAnalysisIfEnabled(item.file)');
  const network = upload.indexOf('uploadProtectedDirect(item, decision, progress)');
  const completion = upload.indexOf('return status;');
  assert.ok(start > 0, 'upload path must start the local sorter for photos');
  assert.ok(network > start, 'local sorting should overlap the upload instead of waiting for backfill');
  assert.match(upload, /persistWebFaceAnalysis\(mediaId, prepared\.analysis\)/);
  assert.match(upload, /recordWebFaceAnalysisFailure/);
  assert.match(upload, /localAnalysisPromise\s*\n\s*\.then/);
  assert.doesNotMatch(upload, /await finishLocalPhotoAnalysis/);
  assert.ok(completion > network, 'upload completion remains owned by media transfer, not face analysis');
});

test('backfill is bounded, cursor-based, backoff-aware and ownership-scoped', () => {
  const route = read('app/api/media/analysis/backfill/route.js');
  assert.match(route, /Math\.min\(12/);
  assert.match(route, /userId: user\.id/);
  assert.match(route, /kind: 'photo'/);
  assert.match(route, /magicAnalysisVersion: \{ \$ne: MAGIC_ANALYSIS_VERSION \}/);
  assert.match(route, /magicAnalysisRetryAt/);
  assert.match(route, /searchParams\.get\('cursor'\)/);
  assert.match(route, /nextCursor/);
  assert.doesNotMatch(route, /body\.userId|searchParams\.get\(['"]userId/);

  const component = read('components/magic-library/PeopleLocalAnalysisBackfill.js');
  assert.match(component, /BACKFILL_PAGE_SIZE = 6/);
  assert.match(component, /BACKFILL_MAX_PER_VISIT = 18/);
  assert.match(component, /query\.set\('cursor', cursor\)/);
  assert.match(component, /analyzeStoredWebPhoto\(item\.id\)/);
});

test('stored local analysis advances backlog and failures get bounded retry state', () => {
  const route = read('app/api/media/[id]/analysis/route.js');
  assert.match(route, /magicAnalysisVersion: normalized\.analysisVersion/);
  assert.match(route, /magicAnalysisFailureCount/);
  assert.match(route, /magicAnalysisRetryAt/);
  assert.match(route, /RETRY_MAX_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(route, /'peopleIntelligence\.status': \{ \$in: \['awaiting_analysis'/);
  assert.match(route, /'peopleIntelligence\.status': 'queued'/);
});

test('defensive crowd cleanup only happens before identity search and association', () => {
  const source = read('lib/people-intelligence.server.js');
  const deleteCall = source.indexOf('await deleteIndexedFaces(collectionId, groupFaceIds)');
  const searchCall = source.indexOf('const matched = await findExistingCluster');
  const associationCall = source.indexOf('await associateFace(collectionId, awsUserId, faceId)');
  assert.ok(deleteCall > 0, 'crowd cleanup call must exist');
  assert.ok(searchCall > deleteCall, 'new crowd vectors are deleted before identity search');
  assert.ok(associationCall > deleteCall, 'new crowd vectors are deleted before association');
  assert.match(source, /const groupFaceIds = usableFaces\.map\(\(face\) => face\.faceId\)/);
});

test('v1.2.1 records the deliberate 5+ automatic exclusion', () => {
  const decisions = read('docs/MAGIC_LIBRARY_INTELLIGENCE_V1_2_1.md');
  assert.match(decisions, /1–4 faces/);
  assert.match(decisions, /5\+ faces/);
  assert.match(decisions, /not truly flat-cost per photo/);
  assert.match(decisions, /does \*\*not\*\* refund/);

  const implementation = read('docs/MAGIC_LIBRARY_IMPLEMENTATION.md');
  assert.match(implementation, /MAGIC_LIBRARY_INTELLIGENCE_V1_2_1\.md/);
  assert.match(implementation, /awaiting_analysis/);
});
