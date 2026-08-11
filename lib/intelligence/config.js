import { peopleActivationReadiness } from '@/lib/intelligence/people-activation-readiness';

export const MAGIC_ANALYSIS_VERSION = 'magic-sorter-v1';
export const FACE_PROCESSING_CONSENT_VERSION = 'face-processing-v1';
export const CLOUD_FACE_RECOGNITION_CONSENT_VERSION = 'cloud-face-recognition-v1';
export const LOCAL_FACE_DETECTION_CONSENT_VERSION = 'local-face-detection-v1';

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
  const activation = peopleActivationReadiness(env);
  const faceProcessingRequested = booleanEnv(env, 'FACE_PROCESSING_ENABLED', false);

  return Object.freeze({
    // Fail closed: merging this code without explicit rollout flags must not
    // start local face analysis or paid cloud face recognition.
    magicSorterEnabled: booleanEnv(env, 'MAGIC_SORTER_ENABLED', false),
    // Production cloud recognition has a second operator interlock. Turning on
    // FACE_PROCESSING_ENABLED alone is intentionally insufficient until AWS,
    // backup/restore and physical-device checks have all been attested.
    faceProcessingRequested,
    faceProcessingEnabled: faceProcessingRequested && activation.ready,
    peopleActivationReady: activation.ready,
    peopleActivationMissing: activation.missing,
    localFaceGateEnabled: booleanEnv(env, 'LOCAL_FACE_GATE_ENABLED', false),
    consentRequired: booleanEnv(env, 'FACE_PROCESSING_CONSENT_REQUIRED', true),
    localConsentRequired: booleanEnv(env, 'LOCAL_FACE_DETECTION_CONSENT_REQUIRED', true),
    minFaceCountForAws,
    maxAutomaticFacesForAws,
    maxIndexedFacesPerPhoto: integerEnv(env, 'MAX_INDEXED_FACES_PER_PHOTO', 15, { min: 1, max: 100 }),
  });
}
