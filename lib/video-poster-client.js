'use client';

import { apiFetch } from '@/lib/api-client';
import {
  VIDEO_POSTER_MAX_BYTES,
  VIDEO_POSTER_SIZE,
  fitVideoPosterDimensions,
} from '@/lib/thumbnails';

const LOAD_TIMEOUT_MS = 8000;
const POSTER_QUALITY = 0.72;

function waitForMediaEvent(target, successEvent, failureEvents = ['error'], timeoutMs = LOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (callback, value) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      target.removeEventListener(successEvent, onSuccess);
      for (const event of failureEvents) target.removeEventListener(event, onFailure);
      callback(value);
    };
    const onSuccess = () => finish(resolve);
    const onFailure = () => finish(reject, new Error('Video frame could not be decoded on this device.'));
    const timer = window.setTimeout(() => finish(reject, new Error('Video frame extraction timed out.')), timeoutMs);
    target.addEventListener(successEvent, onSuccess, { once: true });
    for (const event of failureEvents) target.addEventListener(event, onFailure, { once: true });
  });
}

function canvasToJpeg(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(blob => resolve(blob || null), 'image/jpeg', POSTER_QUALITY);
  });
}

/**
 * Extract one small frame from a local File/Blob. The source never leaves the
 * device for this operation; only the resulting JPEG is eligible for upload.
 */
export async function buildLocalVideoPoster(file) {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !file) return null;

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';

  try {
    video.src = objectUrl;
    video.load();
    await waitForMediaEvent(video, 'loadedmetadata');

    const duration = Number(video.duration);
    const frameTime = Number.isFinite(duration) && duration > 0
      ? Math.min(Math.max(duration * 0.05, 0.05), 0.75)
      : 0.05;

    if (Math.abs(Number(video.currentTime || 0) - frameTime) > 0.01) {
      video.currentTime = frameTime;
      await waitForMediaEvent(video, 'seeked');
    }

    const dimensions = fitVideoPosterDimensions(video.videoWidth, video.videoHeight, VIDEO_POSTER_SIZE);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;

    context.drawImage(video, 0, 0, dimensions.width, dimensions.height);
    const poster = await canvasToJpeg(canvas);
    if (!poster?.size || poster.size > VIDEO_POSTER_MAX_BYTES) return null;
    return poster;
  } catch {
    // Poster generation is an optional browsing optimization. A codec/device
    // failure must never fail, delay, or retry the actual backup.
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function persistLocalVideoPoster(mediaId, poster) {
  if (!mediaId || !poster?.size || poster.size > VIDEO_POSTER_MAX_BYTES) return false;
  const form = new FormData();
  form.append('poster', poster, 'poster.jpg');
  await apiFetch(`/media/${encodeURIComponent(mediaId)}/poster`, {
    method: 'POST',
    body: form,
  });
  return true;
}
