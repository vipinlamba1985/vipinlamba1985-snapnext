import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('full account deletion verifies face recognition cleanup before deleting account data', () => {
  const route = read('app/api/auth/delete-account/route.js');
  const faceAt = route.indexOf('purgeFaceRecognitionBeforeAccountDeletion');
  const accountAt = route.indexOf('deleteUserAccountData({ db, userId: user.id })');
  const userDeleteAt = route.indexOf("db.collection('users').deleteOne");
  assert.ok(faceAt > 0 && accountAt > faceAt && userDeleteAt > accountAt);
  assert.match(route, /faceRecognitionVerified/);
});

test('account face purge covers both legacy and Favourite AWS collections and verifies local stores', () => {
  const helper = read('lib/account-face-deletion.server.js');
  assert.match(helper, /peopleCollectionId\(userId\)/);
  assert.match(helper, /favoritePeopleCollectionId\(userId\)/);
  assert.match(helper, /peopleRekognition\.deleteCollection/);
  assert.match(helper, /peopleRekognition\.describeCollection/);
  assert.match(helper, /deleteSnapNextFaceRecognitionState/);
  assert.match(helper, /verifySnapNextFaceRecognitionStateDeleted/);
  assert.match(helper, /account_face_deletion_verification_failed/);
});
