export const MAGIC_ANALYSIS_VERSION = 'magic-sorter-v1';
export const FACE_PROCESSING_CONSENT_VERSION = 'face-processing-v1';

function booleanEnv(env, name, fallback) {
  const raw = env?.[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(raw).trim().toLowerCase());
}

function integerEnv(env, name, fallback, { min = 0, max = 1000 } = {}) {
  const parsed = Number(env?.[name]);
  const value = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  return Math.max(min, Math.min(max, value));
}

export function intelligenceConfig(env = process.env) {
  const minFaceCountForAws = integerEnv(env, 'MIN_FACE_COUNT_FOR_AWS', 1, { min: 1, max: 100 });
  const maxAutomaticFacesForAws = integerEnv(env, 'MAX_AUTOMATIC_FACES_FOR_AWS', 4, {
    min: minFaceCountForAws,
    max: 100,
  });

  return Object.freeze({
    // Fail closed: merging this code without explicit rollout flags must not
    // start local biometric analysis or paid face processing.
    magicSorterEnabled: booleanEnv(env, 'MAGIC_SORTER_ENABLED', false),
    faceProcessingEnabled: booleanEnv(env, 'FACE_PROCESSING_ENABLED', false),
    localFaceGateEnabled: booleanEnv(env, 'LOCAL_FACE_GATE_ENABLED', false),
    consentRequired: booleanEnv(env, 'FACE_PROCESSING_CONSENT_REQUIRED', true),
    minFaceCountForAws,
    maxAutomaticFacesForAws,
    maxIndexedFacesPerPhoto: integerEnv(env, 'MAX_INDEXED_FACES_PER_PHOTO', 15, { min: 1, max: 100 }),
  });
}
