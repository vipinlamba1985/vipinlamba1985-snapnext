'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';

const NativeLocalFaceAnalysis = registerPlugin('LocalFaceAnalysis');
const SUPPORTED_NATIVE_PLATFORMS = new Set(['ios', 'android']);
const MAX_DETECTION_DIMENSION = 2048;
const JPEG_QUALITY = 0.84;

function currentNativePlatform() {
  const platform = String(Capacitor.getPlatform?.() || '').toLowerCase();
  return Capacitor.isNativePlatform?.() && SUPPORTED_NATIVE_PLATFORMS.has(platform)
    ? platform
    : null;
}

function boundedConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function validatedCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0 || count > 500) {
    throw new Error('Native face detector returned an invalid face count.');
  }
  return count;
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not prepare this photo for on-device face analysis.'));
    };
    image.src = objectUrl;
  });
}

/**
 * Build a bounded, orientation-normalized JPEG for the native detector.
 *
 * The original File/Blob never leaves the device. Canvas decoding also means
 * EXIF orientation is applied before the native SDK sees the pixels, avoiding
 * two platform-specific EXIF parsers in this deliberately small face-count
 * bridge. The downscaled copy exists only in memory for the plugin call.
 */
async function buildDetectionDataUrl(blob) {
  if (!blob || !String(blob.type || '').startsWith('image/')) {
    throw new Error('Native face analysis requires an image.');
  }
  if (typeof document === 'undefined') throw new Error('Native face analysis requires a browser view.');

  const { image, objectUrl } = await loadImage(blob);
  try {
    const width = Number(image.naturalWidth || image.width || 0);
    const height = Number(image.naturalHeight || image.height || 0);
    if (!width || !height) throw new Error('Could not read photo dimensions for local face analysis.');

    const scale = Math.min(1, MAX_DETECTION_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not prepare local face detector canvas.');
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    canvas.width = 1;
    canvas.height = 1;
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function nativeFaceAnalysisCapability() {
  const platform = currentNativePlatform();
  if (!platform) return { supported: false, reason: 'not_native_app' };
  try {
    const result = await NativeLocalFaceAnalysis.getCapability();
    if (result?.supported !== true) {
      return { supported: false, reason: String(result?.reason || 'native_detector_unavailable') };
    }
    const reportedPlatform = String(result.platform || platform).toLowerCase();
    if (reportedPlatform !== platform) {
      return { supported: false, reason: 'native_platform_mismatch' };
    }
    return {
      supported: true,
      platform,
      modelVersion: String(result.modelVersion || 'native-face-detector'),
    };
  } catch {
    return { supported: false, reason: 'native_plugin_missing' };
  }
}

export async function detectNativeFaceCount(blob) {
  const capability = await nativeFaceAnalysisCapability();
  if (!capability.supported) {
    const error = new Error('Native face analysis is unavailable on this device.');
    error.code = capability.reason || 'native_face_analysis_unavailable';
    throw error;
  }

  const dataUrl = await buildDetectionDataUrl(blob);
  const result = await NativeLocalFaceAnalysis.detectFaceCount({ dataUrl });
  const platform = String(result?.platform || capability.platform).toLowerCase();
  if (platform !== capability.platform) throw new Error('Native face detector platform mismatch.');

  return {
    faceCount: validatedCount(result?.faceCount),
    faceDetectionConfidence: boundedConfidence(result?.faceDetectionConfidence),
    platform,
    modelVersion: String(result?.modelVersion || capability.modelVersion),
  };
}
