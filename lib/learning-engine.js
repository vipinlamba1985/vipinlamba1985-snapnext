const ALLOWED = {
  storyTone: new Set(['warm', 'reflective', 'celebratory', 'simple', 'playful']),
  storyLength: new Set(['short', 'medium', 'long']),
  captionStyle: new Set(['short', 'warm', 'playful', 'minimal', 'professional']),
  preferredPlatform: new Set(['instagram', 'facebook', 'linkedin', 'x', 'general']),
};

function clean(value, max = 80) {
  return String(value || '').trim().toLowerCase().slice(0, max);
}

function publicProfile(profile) {
  if (!profile) return { preferences: {}, confidence: {}, evidenceCount: 0 };
  return {
    preferences: profile.preferences || {},
    confidence: profile.confidence || {},
    evidenceCount: Number(profile.evidenceCount) || 0,
    updatedAt: profile.updatedAt || null,
    learningEnabled: profile.learningEnabled !== false,
  };
}

export function normalizeLearningSignal(signal = {}) {
  const type = clean(signal.type, 40);
  const value = clean(signal.value, 80);
  if (!ALLOWED[type]?.has(value)) return null;
  return { type, value };
}

export async function getLearningProfile(db, userId) {
  const profile = await db.collection('user_learning_profiles').findOne({ userId });
  return publicProfile(profile);
}

export async function recordLearningSignal(db, userId, signal, metadata = {}) {
  const normalized = normalizeLearningSignal(signal);
  if (!normalized) return { recorded: false, profile: await getLearningProfile(db, userId) };

  const collection = db.collection('user_learning_profiles');
  const current = await collection.findOne({ userId });
  if (current?.learningEnabled === false) return { recorded: false, disabled: true, profile: publicProfile(current) };

  const counts = { ...(current?.counts || {}) };
  const bucket = { ...(counts[normalized.type] || {}) };
  bucket[normalized.value] = Math.min(1000, (Number(bucket[normalized.value]) || 0) + 1);
  counts[normalized.type] = bucket;

  const preferences = { ...(current?.preferences || {}) };
  const confidence = { ...(current?.confidence || {}) };
  const ranked = Object.entries(bucket).sort((a, b) => b[1] - a[1]);
  preferences[normalized.type] = ranked[0]?.[0] || normalized.value;
  const total = ranked.reduce((sum, [, count]) => sum + count, 0);
  confidence[normalized.type] = total ? Math.min(99, Math.round((ranked[0][1] / total) * 100)) : 0;

  const now = new Date();
  const evidenceCount = Math.min(10000, (Number(current?.evidenceCount) || 0) + 1);
  await collection.updateOne(
    { userId },
    {
      $set: {
        userId,
        learningEnabled: current?.learningEnabled !== false,
        counts,
        preferences,
        confidence,
        evidenceCount,
        lastSignal: { type: normalized.type, source: clean(metadata.source || 'explicit_action', 60), at: now },
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return { recorded: true, profile: await getLearningProfile(db, userId) };
}

export async function setLearningEnabled(db, userId, enabled) {
  const now = new Date();
  await db.collection('user_learning_profiles').updateOne(
    { userId },
    { $set: { userId, learningEnabled: !!enabled, updatedAt: now }, $setOnInsert: { createdAt: now, preferences: {}, confidence: {}, counts: {}, evidenceCount: 0 } },
    { upsert: true },
  );
  return getLearningProfile(db, userId);
}

export async function resetLearningProfile(db, userId) {
  await db.collection('user_learning_profiles').deleteOne({ userId });
  return { preferences: {}, confidence: {}, evidenceCount: 0, learningEnabled: true };
}
