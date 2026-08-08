import { MAGIC_ANALYSIS_VERSION } from './config.js';

const PLATFORMS = new Set(['ios', 'android', 'web']);
const DOCUMENT_TYPES = new Set(['generic_document', 'receipt', 'invoice', 'ticket', 'form', 'business_card', 'id_private', 'other']);

export class MediaAnalysisValidationError extends Error {
  constructor(message, code = 'invalid_media_analysis') {
    super(message);
    this.name = 'MediaAnalysisValidationError';
    this.code = code;
  }
}

function number01(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function requiredBoolean(value, field) {
  if (typeof value !== 'boolean') throw new MediaAnalysisValidationError(`${field} must be a boolean.`);
  return value;
}

function optionalDocumentType(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (!DOCUMENT_TYPES.has(normalized)) throw new MediaAnalysisValidationError('Unsupported documentType.');
  return normalized;
}

export function normalizeMediaAnalysisPayload(body = {}, { now = new Date() } = {}) {
  if (String(body.version || '') !== MAGIC_ANALYSIS_VERSION) {
    throw new MediaAnalysisValidationError('Unsupported analysis version.', 'unsupported_analysis_version');
  }

  const platform = String(body.platform || '').trim().toLowerCase();
  if (!PLATFORMS.has(platform)) throw new MediaAnalysisValidationError('Unsupported analysis platform.');

  const faceCountNumber = Number(body.faceCount);
  if (!Number.isInteger(faceCountNumber) || faceCountNumber < 0 || faceCountNumber > 500) {
    throw new MediaAnalysisValidationError('faceCount must be an integer between 0 and 500.');
  }

  const ocrCharacterCount = Number(body.ocrCharacterCount ?? 0);
  if (!Number.isInteger(ocrCharacterCount) || ocrCharacterCount < 0 || ocrCharacterCount > 1000000) {
    throw new MediaAnalysisValidationError('ocrCharacterCount is invalid.');
  }

  return {
    analysisVersion: MAGIC_ANALYSIS_VERSION,
    platform,
    faceCount: faceCountNumber,
    faceDetectionConfidence: number01(body.faceDetectionConfidence),
    isScreenshot: requiredBoolean(body.isScreenshot, 'isScreenshot'),
    screenshotConfidence: number01(body.screenshotConfidence),
    isDocument: requiredBoolean(body.isDocument, 'isDocument'),
    documentType: optionalDocumentType(body.documentType),
    documentConfidence: number01(body.documentConfidence),
    ocrCharacterCount,
    textDensity: number01(body.textDensity),
    isSensitive: requiredBoolean(body.isSensitive, 'isSensitive'),
    analyzedAt: now,
    updatedAt: now,
  };
}
