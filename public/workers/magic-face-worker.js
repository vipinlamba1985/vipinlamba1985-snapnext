const MEDIAPIPE_VERSION = '1.0.0';
const ASSET_ROOT = `/vendor/mediapipe/tasks-vision/${MEDIAPIPE_VERSION}`;
const MEDIAPIPE_MODULE_URL = `${ASSET_ROOT}/vision_bundle.mjs`;
const MEDIAPIPE_WASM_ROOT = `${ASSET_ROOT}/wasm`;
const FACE_MODEL_URL = `${ASSET_ROOT}/models/blaze_face_full_range_float16_v1.tflite`;

let detectorPromise = null;

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const module = await import(MEDIAPIPE_MODULE_URL);
      const api = module?.default || module;
      const FaceDetector = module?.FaceDetector || api?.FaceDetector;
      const FilesetResolver = module?.FilesetResolver || api?.FilesetResolver;
      if (!FaceDetector || !FilesetResolver) throw new Error('Self-hosted MediaPipe runtime is invalid.');
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
