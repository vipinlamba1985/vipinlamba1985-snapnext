import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MAX_FAMILY_SIZED_FACE_COUNT,
  classifyPersonMedia,
  isLargeGroupPhoto,
} from '../lib/people-gallery-rules.js';

const read = (path) => fs.readFileSync(path, 'utf8');

test('more than four usable faces is a large group photo', () => {
  assert.equal(MAX_FAMILY_SIZED_FACE_COUNT, 4);
  assert.equal(isLargeGroupPhoto(1), false);
  assert.equal(isLargeGroupPhoto(4), false, 'family-sized groups stay eligible');
  assert.equal(isLargeGroupPhoto(5), true);
  assert.equal(isLargeGroupPhoto(30), true);
});

test('group photo detection tolerates missing or invalid counts', () => {
  assert.equal(isLargeGroupPhoto(0), false);
  assert.equal(isLargeGroupPhoto(null), false);
  assert.equal(isLargeGroupPhoto(undefined), false);
  assert.equal(isLargeGroupPhoto(Number.NaN), false);
});

test('the indexer applies the crowd check before any cluster is written', () => {
  const source = read('lib/people-intelligence.server.js');
  const guardAt = source.indexOf('isLargeGroupPhoto(usableFaces.length)');
  const clusterWriteAt = source.indexOf('await upsertCluster(');
  // Call site, not the helper's definition further up the file.
  const searchAt = source.indexOf('await findExistingCluster(');

  assert.ok(guardAt > 0, 'indexer must apply the large-group guard');
  assert.ok(clusterWriteAt > 0, 'indexer still writes clusters for normal photos');
  assert.ok(
    guardAt < clusterWriteAt,
    'the crowd check must run before clusters are created or strengthened',
  );
  assert.ok(
    guardAt < searchAt,
    'a crowd photo must not even search for identities to match',
  );
});

test('an excluded group photo records a terminal status and no clusters', () => {
  const source = read('lib/people-intelligence.server.js');
  assert.match(source, /status: 'group_photo'/);
  assert.match(source, /reason: 'large_group_photo'/);
  // No identities attached, so it cannot strengthen a cluster or a photo count.
  assert.match(source, /clusterIds: \[\]/);
  assert.match(source, /return \{ status: 'group_photo'/);
});

test('group photos are terminal so they are never re-scanned or re-billed', () => {
  const source = read('lib/people-intelligence.server.js');
  assert.match(source, /PEOPLE_TERMINAL_SUCCESS_STATUSES = Object\.freeze\(\['completed', 'skipped', 'no_faces', 'group_photo'\]\)/);
  // Both the "already done" guard and the candidate query use the shared list.
  assert.ok(source.split('PEOPLE_TERMINAL_SUCCESS_STATUSES').length - 1 >= 4);

  const route = read('app/api/magic-library/people/reindex/route.js');
  assert.match(route, /PEOPLE_TERMINAL_SUCCESS_STATUSES/);
  assert.match(route, /'peopleIntelligence\.status': 'group_photo'/);
});

test('an excluded group photo still stays fully available in the library', () => {
  const source = read('lib/people-intelligence.server.js');
  // The exclusion only writes peopleIntelligence; it must never trash or
  // otherwise alter the stored original.
  const block = source.slice(
    source.indexOf('isLargeGroupPhoto(usableFaces.length)'),
    source.indexOf("return { status: 'group_photo'"),
  );
  assert.doesNotMatch(block, /trashed/);
  assert.doesNotMatch(block, /deleteOne|deleteMany|remove\(/);
  assert.match(block, /\$set: \{ peopleIntelligence:/);
});

test('read-time rules agree with the index-time boundary', () => {
  const crowd = classifyPersonMedia({
    peopleIntelligence: { faceIds: ['f1', 'f2', 'f3', 'f4', 'f5'], clusterIds: ['a', 'b', 'c', 'd', 'e'] },
  }, { selectedClusterId: 'a', activeClusterIds: ['a'] });
  assert.equal(crowd.largeGroupPhoto, true);
  assert.equal(isLargeGroupPhoto(crowd.detectedFaceCount), true);

  const family = classifyPersonMedia({
    peopleIntelligence: { faceIds: ['f1', 'f2', 'f3', 'f4'], clusterIds: ['a', 'b', 'c', 'd'] },
  }, { selectedClusterId: 'a' });
  assert.equal(family.largeGroupPhoto, false);
  assert.equal(isLargeGroupPhoto(family.detectedFaceCount), false);
});
