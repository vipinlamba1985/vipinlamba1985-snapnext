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

test('the Favourite indexer applies the crowd check before any identity search or match write', () => {
  const source = read('lib/favorite-people-recognition.server.js');
  const start = source.indexOf('export async function indexFavoriteMediaFaces');
  const automatic = source.slice(start);
  const guardAt = automatic.indexOf('isLargeGroupPhoto(usableFaces.length)');
  const searchAt = automatic.indexOf('peopleRekognition.searchUsers');
  const clusterWriteAt = automatic.indexOf("db.collection('person_clusters').updateOne", searchAt);

  assert.ok(guardAt > 0, 'indexer must apply the large-group guard');
  assert.ok(searchAt > guardAt, 'a crowd photo must not search Favourite identities');
  assert.ok(clusterWriteAt > searchAt, 'normal Favourite matches may update an existing selected person only after search');
});

test('an excluded group photo records a terminal status and no clusters', () => {
  const source = read('lib/favorite-people-recognition.server.js');
  assert.match(source, /status: 'group_photo'/);
  assert.match(source, /reason: 'large_group_photo'/);
  assert.match(source, /faceIds: \[\], clusterIds: \[\]/);
  assert.match(source, /return \{ status: 'group_photo'/);
});

test('group photos are terminal so they are never re-scanned or re-billed', () => {
  const source = read('lib/favorite-people-recognition.server.js');
  assert.match(source, /FAVORITE_TERMINAL_STATUSES = Object\.freeze\(\['completed', 'skipped', 'no_faces', 'group_photo', 'no_favorite_match'\]\)/);
  assert.match(source, /STABLE_ACROSS_FAVORITES = new Set\(\['skipped', 'no_faces', 'group_photo'\]\)/);

  const route = read('app/api/magic-library/people/reindex/route.js');
  assert.match(route, /FAVORITE_TERMINAL_STATUSES/);
  assert.match(route, /'peopleIntelligence\.status': 'group_photo'/);
});

test('an excluded group photo still stays fully available in the library', () => {
  const source = read('lib/favorite-people-recognition.server.js');
  const block = source.slice(
    source.indexOf('isLargeGroupPhoto(usableFaces.length)'),
    source.indexOf("return { status: 'group_photo'"),
  );
  assert.doesNotMatch(block, /collection\('media'\)\.delete|collection\('media'\)\.remove/);
  assert.match(block, /\$set: \{ peopleIntelligence:/);
});

test('read-time rules agree with the local/index-time boundary without retained per-photo face ids', () => {
  const crowd = classifyPersonMedia({
    peopleIntelligence: { detectedFaceCount: 5, faceIds: [], clusterIds: ['a'] },
  }, { selectedClusterId: 'a', activeClusterIds: ['a'] });
  assert.equal(crowd.largeGroupPhoto, true);
  assert.equal(isLargeGroupPhoto(crowd.detectedFaceCount), true);

  const family = classifyPersonMedia({
    peopleIntelligence: { detectedFaceCount: 4, faceIds: [], clusterIds: ['a'] },
  }, { selectedClusterId: 'a' });
  assert.equal(family.largeGroupPhoto, false);
  assert.equal(isLargeGroupPhoto(family.detectedFaceCount), false);
});
