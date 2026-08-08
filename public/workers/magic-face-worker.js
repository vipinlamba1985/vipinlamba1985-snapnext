const MEDIAPIPE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm';
const MEDIAPIPE_WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let detectorPromise = null;

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import(MEDIAPIPE_MODULE_URL);
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);
      return FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.3,
      });
    })();
  }
  return detectorPromise;
}

function averageConfidence(detections = []) {
  const scores = [];
  for (const detection of detections) {
    for (const category of detection?.categories || []) {
      const score = Number(category?.score);
      if (Number.isFinite(score)) scores.push(score);
    }
  }
  if (!scores.length) return detections.length ? 0.5 : 1;
  return Math.max(0, Math.min(1, scores.reduce((sum, score) => sum + score, 0) / scores.length));
}

self.onmessage = async (event) => {
  const { id, blob } = event.data || {};
  if (!id || !blob) return;

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
    const detector = await getDetector();
    const result = detector.detect(bitmap);
    const detections = Array.isArray(result?.detections) ? result.detections : [];
    self.postMessage({
      id,
      ok: true,
      faceCount: detections.length,
      faceDetectionConfidence: averageConfidence(detections),
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: String(error?.message || error || 'web_face_detection_failed').slice(0, 300),
    });
  } finally {
    try { bitmap?.close?.(); } catch {}
  }
};
