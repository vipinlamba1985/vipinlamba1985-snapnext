import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMediaDeletionGenerationCurrent,
  beginMediaDeletionGeneration,
  completeMediaDeletionGeneration,
  getMediaDeletionGeneration,
  getMediaDeletionGenerationState,
  mediaDeletionGenerationIsCurrent,
} from '../lib/media-deletion-generation.server.js';

function fakeDb(initialUser = { id: 'u1' }) {
  let user = { ...initialUser };

  function matches(filter = {}) {
    if (filter.id !== user.id) return false;
    if (filter.mediaDeletionGeneration != null
      && Number(filter.mediaDeletionGeneration) !== Number(user.mediaDeletionGeneration || 0)) return false;
    if (filter.mediaDeletionInProgressGeneration != null
      && Number(filter.mediaDeletionInProgressGeneration) !== Number(user.mediaDeletionInProgressGeneration)) return false;
    return true;
  }

  function apply(update = {}) {
    if (update.$inc?.mediaDeletionGeneration) {
      user.mediaDeletionGeneration = Number(user.mediaDeletionGeneration || 0) + update.$inc.mediaDeletionGeneration;
    }
    if (update.$set) user = { ...user, ...update.$set };
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) delete user[key];
    }
  }

  return {
    collection(name) {
      assert.equal(name, 'users');
      return {
        async findOne(filter) {
          return matches(filter) ? { ...user } : null;
        },
        async findOneAndUpdate(filter, update) {
          if (!matches(filter)) return null;
          apply(update);
          return { ...user };
        },
        async updateOne(filter, update) {
          if (!matches(filter)) return { matchedCount: 0, modifiedCount: 0 };
          apply(update);
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
  };
}

test('media deletion generation increments and stays non-current while deletion is active', async () => {
  const db = fakeDb();
  assert.equal(await getMediaDeletionGeneration({ db, userId: 'u1' }), 0);

  const generation = await beginMediaDeletionGeneration({ db, userId: 'u1', reason: 'test-delete' });
  assert.equal(generation, 1);
  assert.deepEqual(await getMediaDeletionGenerationState({ db, userId: 'u1' }), {
    generation: 1,
    inProgressGeneration: 1,
  });
  assert.equal((await mediaDeletionGenerationIsCurrent({ db, userId: 'u1', generation: 1 })).current, false);

  assert.deepEqual(await completeMediaDeletionGeneration({ db, userId: 'u1', generation: 1 }), { completed: true });
  assert.deepEqual(await getMediaDeletionGenerationState({ db, userId: 'u1' }), {
    generation: 1,
    inProgressGeneration: null,
  });
  assert.equal((await mediaDeletionGenerationIsCurrent({ db, userId: 'u1', generation: 1 })).current, true);
});

test('render generation check rejects a stale generation after a later deletion begins', async () => {
  const db = fakeDb({ id: 'u1', mediaDeletionGeneration: 4 });
  assert.equal((await mediaDeletionGenerationIsCurrent({ db, userId: 'u1', generation: 4 })).current, true);

  await beginMediaDeletionGeneration({ db, userId: 'u1' });
  const state = await mediaDeletionGenerationIsCurrent({ db, userId: 'u1', generation: 4 });
  assert.equal(state.current, false);
  assert.equal(state.actual, 5);
  assert.equal(state.inProgressGeneration, 5);
  await assert.rejects(
    () => assertMediaDeletionGenerationCurrent({ db, userId: 'u1', generation: 4 }),
    { code: 'media_deletion_generation_stale' },
  );
});

test('completion cannot clear a newer deletion generation lease', async () => {
  const db = fakeDb({ id: 'u1', mediaDeletionGeneration: 7, mediaDeletionInProgressGeneration: 7 });
  assert.deepEqual(await completeMediaDeletionGeneration({ db, userId: 'u1', generation: 6 }), { completed: false });
  assert.deepEqual(await getMediaDeletionGenerationState({ db, userId: 'u1' }), {
    generation: 7,
    inProgressGeneration: 7,
  });
});
