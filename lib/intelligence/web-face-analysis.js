'use client';

import { apiFetch, getToken, mediaSrc } from '@/lib/api-client';
import { detectNativeFaceCount, nativeFaceAnalysisCapability } from '@/lib/intelligence/native-face-analysis';

const WORKER_URL = '/workers/magic-face-worker.js';
const ANALYSIS_VERSION = 'magic-sorter-v1';
let worker = null;
let requestCounter = 0;
let enabledPromise = null;
const pending = new Map();

export async function webFaceAnalysisEnabled() {
  if (!enabledPromise) {
    enabledPromise = apiFetch('/media/analysis/config')
      .then((state) => Boolean(state?.enabled && state?.version === ANALYSIS_VERSION))
      .catch(() => false);
  }
  return enabledPromise;
}

function getWorker() {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (worker) return worker;

  worker = new Worker(WORKER_URL, { type: 'module' });
  worker.onmessage = (event) => {
    const result = event.data || {};
    const entry = pending.get(result.id);
    if (!entry) return;
    pending.delete(result.id);
    if (result.ok) entry.resolve(result);
    else entry.reject(new Error(result.error || 'Local face detection failed.'));
  };
  worker.onerror = (event) => {
    const error = new Error(event?.message || 'Local face detector worker failed.');
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    try { worker?.terminate?.(); } catch {}
    worker = null;
  };
  return worker;
}

function isImageBlob(blob) {
  return Boolean(blob && (String(blob.type || '').startsWith('image/') || blob instanceof File));
}

export async function detectWebFaceCount(blob) {
  if (!isImageBlob(blob)) throw new Error('Face analysis requires an image.');
  const currentWorker = getWorker();
  if (!currentWorker) throw new Error('Local face analysis is not supported in this browser.');

  const id = `face-${Date.now()}-${++requestCounter}`;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error('Local face analysis timed out.'));
    }, 30000);

    pending.set(id, {
      resolve: (result) => { window.clearTimeout(timeout); resolve(result); },
      reject: (error) => { window.clearTimeout(timeout); reject(error); },
    });
    currentWorker.postMessage({ id, blob });
  });
}

export async function detectLocalFaceCount(blob) {
  const capability = await nativeFaceAnalysisCapability();
  if (capability.supported) {
    try {
      return await detectNativeFaceCount(blob);
    } catch {
      // A native detector failure must never trigger cloud recognition. Falling
      // back to the existing self-hosted MediaPipe worker remains fully local
      // and gives the user a second on-device path before recording a failure.
    }
  }
  const result = await detectWebFaceCount(blob);
  return { ...result, platform: 'web', modelVersion: 'mediapipe-face-detector-1.0.0' };
}

function analysisPayload(result, platform = 'web') {
  return {
    version: ANALYSIS_VERSION,
    platform,
    faceCount: Number(result.faceCount || 0),
    faceDetectionConfidence: Number(result.faceDetectionConfidence ?? 0),
    // M1's producer intentionally supplies face-gate data only. These
    // conservative zero-confidence placeholders are replaced by the full Magic
    // Sorter classification work in M3-M5 and are never treated as evidence.
    isScreenshot: false,
    screenshotConfidence: 0,
    isDocument: false,
    documentType: null,
    documentConfidence: 0,
    ocrCharacterCount: 0,
    textDensity: 0,
    isSensitive: false,
  };
}

export async function buildWebFaceAnalysis(blob) {
  const result = await detectWebFaceCount(blob);
  return analysisPayload(result, 'web');
}

export async function buildLocalFaceAnalysis(blob) {
  const result = await detectLocalFaceCount(blob);
  return analysisPayload(result, String(result.platform || 'web'));
}

// Kept under the original export name so upload/backfill callers do not need a
// migration. In a Capacitor shell it now prefers the native count-only plugin;
// on the web it remains the pinned self-hosted MediaPipe producer.
export async function buildWebFaceAnalysisIfEnabled(blob) {
  if (!(await webFaceAnalysisEnabled())) return null;
  return buildLocalFaceAnalysis(blob);
}

export async function persistWebFaceAnalysis(mediaId, analysis) {
  if (!mediaId || !analysis) return null;
  return apiFetch(`/media/${encodeURIComponent(mediaId)}/analysis`, {
    method: 'POST',
    body: JSON.stringify(analysis),
  });
}

export async function recordWebFaceAnalysisFailure(mediaId, error) {
  if (!mediaId) return null;
  return apiFetch(`/media/${encodeURIComponent(mediaId)}/analysis`, {
    method: 'PATCH',
    body: JSON.stringify({ error: String(error?.message || error || 'local_face_analysis_failed').slice(0, 240) }),
  });
}

export async function analyzeAndPersistWebPhoto({ mediaId, blob }) {
  try {
    const analysis = await buildWebFaceAnalysisIfEnabled(blob);
    if (!analysis) return null;
    await persistWebFaceAnalysis(mediaId, analysis);
    return analysis;
  } catch (error) {
    await recordWebFaceAnalysisFailure(mediaId, error).catch(() => null);
    throw error;
  }
}

export async function analyzeStoredWebPhoto(mediaId) {
  if (!(await webFaceAnalysisEnabled())) return null;
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  let blob;
  try {
    const response = await fetch(mediaSrc(mediaId), { headers, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Could not load media for local analysis (${response.status}).`);
    blob = await response.blob();
  } catch (error) {
    // Fetch failures happen before analyzeAndPersistWebPhoto owns the attempt,
    // so record them here. Detection/persist failures are recorded by that
    // function exactly once.
    await recordWebFaceAnalysisFailure(mediaId, error).catch(() => null);
    throw error;
  }

  return analyzeAndPersistWebPhoto({ mediaId, blob });
}
