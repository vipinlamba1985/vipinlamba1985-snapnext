import {
  CLOUD_FACE_RECOGNITION_CONSENT_VERSION,
  FACE_PROCESSING_CONSENT_VERSION,
  LOCAL_FACE_DETECTION_CONSENT_VERSION,
  MAGIC_ANALYSIS_VERSION,
  intelligenceConfig,
} from './config.js';

const DELETION_BLOCKING_STATES = new Set(['pending', 'processing', 'verifying', 'failed']);

function normalizedFaceCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  return Math.max(0, Math.floor(count));
}

export function cloudFaceRecognitionConsent(user = {}) {
  return user?.cloudFaceRecognitionConsent || user?.faceProcessingConsent || {};
}

export function hasLocalFaceDetectionConsent(user = {}, version = LOCAL_FACE_DETECTION_CONSENT_VERSION) {
  const consent = user?.localFaceDetectionConsent || {};
  return consent.granted === true
    && !consent.revokedAt
    && String(consent.version || '') === String(version);
}

export function hasFaceProcessingConsent(user = {}) {
  const consent = cloudFaceRecognitionConsent(user);
  const version = String(consent.version || '');
  const supportedVersion = version === CLOUD_FACE_RECOGNITION_CONSENT_VERSION
    || version === FACE_PROCESSING_CONSENT_VERSION;
  return consent.granted === true
    && !consent.revokedAt
    && !DELETION_BLOCKING_STATES.has(String(consent.deletionState || 'none'))
    && supportedVersion;
}

export function evaluateFaceGate({ analysis = null, user = null, config = intelligenceConfig() } = {}) {
  // Treat an omitted master flag in hand-built test configs as legacy-enabled;
  // the real environment config always supplies an explicit boolean.
  if (config.magicSorterEnabled === false) {
    return { eligible: false, deferred: true, status: 'face_gate_disabled', reason: 'magic_sorter_disabled', faceCount: null };
  }
  if (!config.faceProcessingEnabled) {
    return { eligible: false, deferred: true, status: 'face_processing_disabled', reason: 'face_processing_disabled', faceCount: null };
  }
  if (!config.localFaceGateEnabled) {
    return { eligible: false, deferred: true, status: 'face_gate_disabled', reason: 'local_face_gate_disabled', faceCount: null };
  }
  if (!analysis) {
    return { eligible: false, deferred: true, status: 'awaiting_analysis', reason: 'local_analysis_missing', faceCount: null };
  }
  if (String(analysis.analysisVersion || '') !== MAGIC_ANALYSIS_VERSION) {
    return { eligible: false, deferred: true, status: 'awaiting_analysis', reason: 'local_analysis_version_mismatch', faceCount: null };
  }

  const faceCount = normalizedFaceCount(analysis.faceCount);
  if (faceCount === null) {
    return { eligible: false, deferred: true, status: 'awaiting_analysis', reason: 'local_face_count_invalid', faceCount: null };
  }

  if (faceCount < config.minFaceCountForAws) {
    return { eligible: false, deferred: false, terminal: true, status: 'no_faces', reason: 'local_no_faces', faceCount };
  }

  if (faceCount > config.maxAutomaticFacesForAws) {
    return { eligible: false, deferred: false, terminal: true, status: 'group_photo', reason: 'large_group_photo', faceCount };
  }

  if (config.consentRequired && !hasFaceProcessingConsent(user)) {
    return { eligible: false, deferred: true, status: 'awaiting_consent', reason: 'face_processing_consent_required', faceCount };
  }

  return { eligible: true, deferred: false, terminal: false, status: 'eligible', reason: 'local_face_gate_passed', faceCount };
}
