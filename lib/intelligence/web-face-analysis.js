'use client';

import { apiFetch, getToken, mediaSrc } from '@/lib/api-client';

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

export async function buildWebFaceAnalysis(blob) {
  const result = await detectWebFaceCount(blob);
  return {
    version: ANALYSIS_VERSION,
    platform: 'web',
    faceCount: Number(result.faceCount || 0),
    faceDetectionConfidence: Number(result.faceDetectionConfidence ?? 0),
    // M1's web producer intentionally supplies face-gate data only. These
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

export async function buildWebFaceAnalysisIfEnabled(blob) {
  if (!(await webFaceAnalysisEnabled())) return null;
  return buildWebFaceAnalysis(blob);
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
  try {
    const response = await fetch(mediaSrc(mediaId), { headers, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Could not load media for local analysis (${response.status}).`);
    const blob = await response.blob();
    return await analyzeAndPersistWebPhoto({ mediaId, blob });
  } catch (error) {
    await recordWebFaceAnalysisFailure(mediaId, error).catch(() => null);
    throw error;
  }
}
