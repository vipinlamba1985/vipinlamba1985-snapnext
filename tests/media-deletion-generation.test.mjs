import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMediaDeletionGenerationCurrent,
  beginMediaDeletionGeneration,
  getMediaDeletionGeneration,
  mediaDeletionGenerationIsCurrent,
} from '../lib/media-deletion-generation.server.js';

function fakeDb(initialUser = { id: 'u1' }) {
  let user = { ...initialUser };
  return {
    collection(name) {
      assert.equal(name, 'users');
      return {
        async findOne(filter) {
          return filter.id === user.id ? { ...user } : null;
        },
        async findOneAndUpdate(filter, update) {
          if (filter.id !== user.id) return null;
          if (update.$inc?.mediaDeletionGeneration) {
            user.mediaDeletionGeneration = Number(user.mediaDeletionGeneration || 0) + update.$inc.mediaDeletionGeneration;
          }
          if (update.$set) user = { ...user, ...update.$set };
          return { ...user };
        },
      };
    },
  };
}

test('media deletion generation starts at zero and increments before permanent deletion', async () => {
  const db = fakeDb();
  assert.equal(await getMediaDeletionGeneration({ db, userId: 'u1' }), 0);
  assert.equal(await beginMediaDeletionGeneration({ db, userId: 'u1', reason: 'test-delete' }), 1);
  assert.equal(await getMediaDeletionGeneration({ db, userId: 'u1' }), 1);
});

test('render generation check rejects a stale generation', async () => {
  const db = fakeDb({ id: 'u1', mediaDeletionGeneration: 4 });
  assert.equal((await mediaDeletionGenerationIsCurrent({ db, userId: 'u1', generation: 4 })).current, true);
  await beginMediaDeletionGeneration({ db, userId: 'u1' });
  const state = await mediaDeletionGenerationIsCurrent({ db, userId: 'u1', generation: 4 });
  assert.equal(state.current, false);
  assert.equal(state.actual, 5);
  await assert.rejects(
    () => assertMediaDeletionGenerationCurrent({ db, userId: 'u1', generation: 4 }),
    { code: 'media_deletion_generation_stale' },
  );
});
