function resultDocument(result) {
  return result?.value || result || null;
}

function normalizedGeneration(value) {
  const generation = Number(value);
  return Number.isFinite(generation) && generation >= 0 ? Math.floor(generation) : 0;
}

export async function getMediaDeletionGeneration({ db, userId }) {
  if (!db || !userId) throw new Error('Database and user id are required for media deletion generation.');
  const user = await db.collection('users').findOne(
    { id: userId },
    { projection: { mediaDeletionGeneration: 1 } },
  );
  if (!user) {
    const error = new Error('User not found while reading media deletion generation.');
    error.code = 'media_deletion_user_not_found';
    throw error;
  }
  return normalizedGeneration(user.mediaDeletionGeneration);
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
  return normalizedGeneration(user.mediaDeletionGeneration);
}

export async function mediaDeletionGenerationIsCurrent({ db, userId, generation }) {
  const current = await getMediaDeletionGeneration({ db, userId });
  return { current: current === normalizedGeneration(generation), expected: normalizedGeneration(generation), actual: current };
}

export async function assertMediaDeletionGenerationCurrent({ db, userId, generation }) {
  const state = await mediaDeletionGenerationIsCurrent({ db, userId, generation });
  if (state.current) return state;
  const error = new Error('Media deletion generation moved while derived media work was in flight.');
  error.code = 'media_deletion_generation_stale';
  error.expectedGeneration = state.expected;
  error.actualGeneration = state.actual;
  throw error;
}
