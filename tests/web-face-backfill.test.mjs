import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('web producer uses pinned local MediaPipe face detection assets', () => {
  const worker = read('public/workers/magic-face-worker.js');
  assert.match(worker, /MEDIAPIPE_VERSION = '1\.0\.0'/);
  assert.match(worker, /blaze_face_full_range/);
  assert.match(worker, /FaceDetector\.createFromOptions/);
  assert.match(worker, /detector\.detect\(bitmap\)/);
  assert.doesNotMatch(worker, /Rekognition|DetectFacesCommand|IndexFacesCommand/);
});

test('web analysis persists face count through the authenticated media analysis API', () => {
  const client = read('lib/intelligence/web-face-analysis.js');
  assert.match(client, /platform: 'web'/);
  assert.match(client, /faceCount: Number\(result\.faceCount/);
  assert.match(client, /apiFetch\(`\/media\/\$\{encodeURIComponent\(mediaId\)\}\/analysis`/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
});

test('backfill is bounded and ownership-scoped', () => {
  const route = read('app/api/media/analysis/backfill/route.js');
  assert.match(route, /Math\.min\(12/);
  assert.match(route, /userId: user\.id/);
  assert.match(route, /kind: 'photo'/);
  assert.match(route, /magicAnalysisVersion: \{ \$ne: MAGIC_ANALYSIS_VERSION \}/);
  assert.doesNotMatch(route, /body\.userId|searchParams\.get\(['"]userId/);

  const component = read('components/magic-library/PeopleLocalAnalysisBackfill.js');
  assert.match(component, /BACKFILL_LIMIT = 6/);
  assert.match(component, /analyzeStoredWebPhoto\(item\.id\)/);
  assert.match(component, /remain awaiting_analysis/);
});

test('stored local analysis marks the media version so backlog work advances', () => {
  const route = read('app/api/media/[id]/analysis/route.js');
  assert.match(route, /magicAnalysisVersion: normalized\.analysisVersion/);
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
