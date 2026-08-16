function resultDocument(result) {
  return result?.value || result || null;
}

function normalizedGeneration(value) {
  const generation = Number(value);
  return Number.isFinite(generation) && generation >= 0 ? Math.floor(generation) : 0;
}

export async function getMediaDeletionGenerationState({ db, userId }) {
  if (!db || !userId) throw new Error('Database and user id are required for media deletion generation.');
  const user = await db.collection('users').findOne(
    { id: userId },
    { projection: { mediaDeletionGeneration: 1, mediaDeletionInProgressGeneration: 1 } },
  );
  if (!user) {
    const error = new Error('User not found while reading media deletion generation.');
    error.code = 'media_deletion_user_not_found';
    throw error;
  }
  return {
    generation: normalizedGeneration(user.mediaDeletionGeneration),
    inProgressGeneration: user.mediaDeletionInProgressGeneration == null
      ? null
      : normalizedGeneration(user.mediaDeletionInProgressGeneration),
  };
}

export async function getMediaDeletionGeneration({ db, userId }) {
  return (await getMediaDeletionGenerationState({ db, userId })).generation;
}

export async function beginMediaDeletionGeneration({ db, userId, reason = 'permanent_media_delete' }) {
  if (!db || !userId) throw new Error('Database and user id are required for media deletion generation.');
  const now = new Date();
  const user = resultDocument(await db.collection('users').findOneAndUpdate(
    { id: userId },
    {
      $inc: { mediaDeletionGeneration: 1 },
      $set: { mediaDeletionGenerationUpdatedAt: now, mediaDeletionGenerationReason: reason },
    },
    { returnDocument: 'after' },
  ));
  if (!user) {
    const error = new Error('User not found while starting media deletion.');
    error.code = 'media_deletion_user_not_found';
    throw error;
  }
  const generation = normalizedGeneration(user.mediaDeletionGeneration);
  const claimed = await db.collection('users').updateOne(
    { id: userId, mediaDeletionGeneration: generation },
    {
      $set: {
        mediaDeletionInProgressGeneration: generation,
        mediaDeletionInProgressAt: now,
      },
    },
  );
  if (claimed.matchedCount !== 1) {
    const error = new Error('Media deletion generation changed before the operation could be claimed.');
    error.code = 'media_deletion_generation_claim_lost';
    throw error;
  }
  return generation;
}

export async function completeMediaDeletionGeneration({ db, userId, generation }) {
  if (!db || !userId) return { completed: false };
  const result = await db.collection('users').updateOne(
    { id: userId, mediaDeletionInProgressGeneration: normalizedGeneration(generation) },
    {
      $unset: {
        mediaDeletionInProgressGeneration: '',
        mediaDeletionInProgressAt: '',
      },
      $set: { mediaDeletionLastCompletedAt: new Date() },
    },
  );
  return { completed: result.matchedCount === 1 };
}

export async function mediaDeletionGenerationIsCurrent({ db, userId, generation }) {
  const state = await getMediaDeletionGenerationState({ db, userId });
  const expected = normalizedGeneration(generation);
  return {
    current: state.generation === expected && state.inProgressGeneration == null,
    expected,
    actual: state.generation,
    inProgressGeneration: state.inProgressGeneration,
  };
}

export async function assertMediaDeletionGenerationCurrent({ db, userId, generation }) {
  const state = await mediaDeletionGenerationIsCurrent({ db, userId, generation });
  if (state.current) return state;
  const error = new Error('Media deletion generation moved or deletion is active while derived media work was in flight.');
  error.code = 'media_deletion_generation_stale';
  error.expectedGeneration = state.expected;
  error.actualGeneration = state.actual;
  error.inProgressGeneration = state.inProgressGeneration;
  throw error;
}
