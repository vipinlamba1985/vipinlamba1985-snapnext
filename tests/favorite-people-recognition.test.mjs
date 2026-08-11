import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  favoritePeopleCollectionId,
  favoritePeopleLimitForPlan,
  isUsableFavoriteLabel,
  normalizeFavoritePeople,
} from '../lib/favorite-people.js';
import { peopleCollectionId } from '../lib/people-intelligence.js';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Favourite People cloud recognition has the intended narrow per-plan caps', () => {
  assert.equal(favoritePeopleLimitForPlan('free'), 0);
  assert.equal(favoritePeopleLimitForPlan('starter'), 2);
  for (const plan of ['plus', 'pro', 'family', 'super_user']) assert.equal(favoritePeopleLimitForPlan(plan), 3);
  assert.equal(favoritePeopleLimitForPlan('unknown'), 0);
});

test('Favourite selections are bounded inputs and relationship labels remain usable', () => {
  assert.deepEqual(normalizeFavoritePeople(['a', ' a ', 'b', '', null]), ['a', 'b']);
  assert.equal(isUsableFavoriteLabel('Mom'), true);
  assert.equal(isUsableFavoriteLabel('Dad'), true);
  assert.equal(isUsableFavoriteLabel('Partner'), true);
  assert.equal(isUsableFavoriteLabel('Unknown'), false);
  assert.equal(isUsableFavoriteLabel('Add name'), false);
});

test('Favourite People uses a collection separate from the retired broad People collection', () => {
  const userId = 'user-test-123';
  const favorite = favoritePeopleCollectionId(userId);
  const legacy = peopleCollectionId(userId);
  assert.notEqual(favorite, legacy);
  assert.match(favorite, /^snapnext_favorite_people_v1_/);
});

test('production reindex route cannot call the retired broad discovery engine', () => {
  const route = read('app/api/magic-library/people/reindex/route.js');
  assert.match(route, /favorite-people-recognition\.server/);
  assert.match(route, /rebuildFavoritePeopleRecognition/);
  assert.doesNotMatch(route, /from '@\/lib\/people-intelligence\.server'/);
  assert.doesNotMatch(route, /rebuildPeopleIntelligence/);
});

test('recovery cannot re-index an arbitrary non-Favourite face', () => {
  const route = read('app/api/magic-library/people/recover/route.js');
  assert.match(route, /recognitionFavorites/);
  assert.match(route, /favorite_people_recognition/);
  assert.match(route, /favorite_reference_required/);
  assert.doesNotMatch(route, /indexMediaFaces/);
  assert.doesNotMatch(route, /people-intelligence\.server/);
});

test('automatic matching never creates an identity for an unmatched face', () => {
  const engine = read('lib/favorite-people-recognition.server.js');
  assert.match(engine, /NOT_SELECTED_FAVORITE/);
  assert.match(engine, /no_favorite_match/);
  assert.match(engine, /favoriteState\.byAwsUser/);
  assert.doesNotMatch(engine, /uuidv4|randomUUID/);
  const automaticStart = engine.indexOf('export async function indexFavoriteMediaFaces');
  const automatic = engine.slice(automaticStart);
  assert.doesNotMatch(automatic, /ensureAwsUser\(/, 'ordinary-photo matching must never create a new AWS identity');
  assert.doesNotMatch(automatic, /createUser\(/, 'ordinary-photo matching must never create a new AWS identity');
});

test('local face gate and explicit Favourite selection both happen before automatic AWS access', () => {
  const engine = read('lib/favorite-people-recognition.server.js');
  const start = engine.indexOf('export async function indexFavoriteMediaFaces');
  const source = engine.slice(start);
  const gateAt = source.indexOf('const gate = await localFaceGateForMedia');
  const favoriteAt = source.indexOf('if (!favoriteState.selected.length)');
  const collectionAt = source.indexOf('const collectionId = await ensureCollection(userId)');
  const indexAt = source.indexOf('peopleRekognition.indexFaces');
  assert.ok(gateAt > 0);
  assert.ok(favoriteAt > gateAt);
  assert.ok(collectionAt > favoriteAt);
  assert.ok(indexAt > collectionAt);
});

test('ordinary-photo cloud face vectors are temporary and deleted after matching', () => {
  const engine = read('lib/favorite-people-recognition.server.js');
  const start = engine.indexOf('export async function indexFavoriteMediaFaces');
  const source = engine.slice(start);
  const searchAt = source.indexOf('peopleRekognition.searchUsers');
  const finallyAt = source.indexOf('finally {', searchAt);
  const deleteAt = source.indexOf('deleteFaces(collectionId, allTemporaryFaceIds)', finallyAt);
  assert.ok(searchAt > 0 && finallyAt > searchAt && deleteAt > finallyAt);
  assert.match(source, /retainedCloudFaceVectorsForMedia: 0/);
  assert.doesNotMatch(source, /associateFaces/, 'ordinary photo vectors must not be accumulated as Favourite reference vectors');
});

test('enrolment itself requires a trusted solo photo', () => {
  const engine = read('lib/favorite-people-recognition.server.js');
  const start = engine.indexOf('export async function enrollFavoritePerson');
  const end = engine.indexOf('export async function removeFavoriteEnrollment', start);
  const source = engine.slice(start, end);
  const gateAt = source.indexOf('localFaceGateForMedia');
  const soloAt = source.indexOf('Number(gate.faceCount) !== 1');
  const collectionAt = source.indexOf('ensureCollection(userId)');
  assert.ok(gateAt > 0 && soloAt > gateAt && collectionAt > soloAt);
  assert.match(source, /MaxFaces: 1/);
});

test('removing a Favourite deletes the AWS user and its retained enrolment vectors', () => {
  const engine = read('lib/favorite-people-recognition.server.js');
  const start = engine.indexOf('export async function removeFavoriteEnrollment');
  const end = engine.indexOf('async function clearRemovedFavoriteMatches', start);
  const source = engine.slice(start, end);
  const userAt = source.indexOf('peopleRekognition.deleteUser');
  const facesAt = source.indexOf('deleteFaces(collectionId, enrollment.faceIds');
  assert.ok(userAt > 0 && facesAt > userAt);
  assert.match(source, /favorite_people_recognition'\)\.deleteOne/);
});

test('full verified deletion covers Favourite selection, enrolments and both AWS collections', () => {
  const inventory = read('lib/face-deletion-inventory.js');
  const worker = read('lib/face-deletion-worker.server.js');
  assert.match(inventory, /favorite_people_recognition/);
  assert.match(inventory, /recognitionFavorites/);
  assert.match(worker, /peopleCollectionId\(userId\)/);
  assert.match(worker, /favoritePeopleCollectionId\(userId\)/);
  assert.match(worker, /verifyRekognitionCollectionsAbsent/);
});

test('Magic Library tells users that only chosen Favourite People are matched', () => {
  const panel = read('components/magic-library/FavoritePeoplePanel.js');
  const gallery = read('components/magic-library/MagicLibraryGallery.js');
  assert.match(panel, /Cloud matching is limited to the people you choose here/);
  assert.match(panel, /Other faces are ignored and never added automatically/);
  assert.match(panel, /Ordinary-photo face vectors are temporary/);
  assert.match(panel, /0-face photos and 5\+ face group photos never enter/);
  assert.match(gallery, /<FavoritePeoplePanel people=\{magic\.people\} \/>/);
});
