'use client';

const SAMPLE_LIMIT = 240;
const FACE_SIZE = 16;

function samplePhotos(items) {
  const photos = items.filter((item) => item.kind === 'photo');
  if (photos.length <= SAMPLE_LIMIT) return photos;
  const step = photos.length / SAMPLE_LIMIT;
  return Array.from({ length: SAMPLE_LIMIT }, (_, index) => photos[Math.floor(index * step)]);
}

function cosine(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return dot / Math.max(Math.sqrt(aa * bb), 1e-8);
}

async function imageBitmap(file) {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function descriptorFromFace(bitmap, box) {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_SIZE;
  canvas.height = FACE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, FACE_SIZE, FACE_SIZE);
  const pixels = ctx.getImageData(0, 0, FACE_SIZE, FACE_SIZE).data;
  const vector = [];
  let mean = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const value = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) / 255;
    vector.push(value);
    mean += value;
  }
  mean /= vector.length;
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) {
    vector[i] -= mean;
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm) || 1;
  return vector.map((value) => value / norm);
}

function facePreview(bitmap, box) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, 128, 128);
  return canvas.toDataURL('image/jpeg', 0.78);
}

function addToClusters(clusters, face) {
  let best = null;
  let bestScore = 0;
  for (const cluster of clusters) {
    const score = cosine(cluster.centroid, face.descriptor);
    if (score > bestScore) { best = cluster; bestScore = score; }
  }
  if (!best || bestScore < 0.78) {
    clusters.push({ id: `person-${clusters.length + 1}`, centroid: face.descriptor, faces: [face], preview: face.preview, count: 1 });
    return;
  }
  best.faces.push(face);
  best.count += 1;
  best.centroid = best.centroid.map((value, index) => ((value * (best.count - 1)) + face.descriptor[index]) / best.count);
}

export function localFaceDiscoverySupported() {
  return typeof window !== 'undefined' && 'FaceDetector' in window && 'createImageBitmap' in window;
}

export async function discoverLocalPeople(items, onProgress) {
  if (!localFaceDiscoverySupported()) return { supported: false, clusters: [], scanned: 0 };
  const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 12 });
  const photos = samplePhotos(items);
  const clusters = [];
  for (let index = 0; index < photos.length; index += 1) {
    let bitmap;
    try {
      bitmap = await imageBitmap(photos[index].file);
      const faces = await detector.detect(bitmap);
      for (const detected of faces) {
        const box = detected.boundingBox;
        if (!box || box.width < 32 || box.height < 32) continue;
        addToClusters(clusters, {
          localId: photos[index].localId,
          descriptor: descriptorFromFace(bitmap, box),
          preview: facePreview(bitmap, box),
        });
      }
    } catch {}
    finally { bitmap?.close?.(); }
    onProgress?.(index + 1, photos.length, clusters.length);
  }
  clusters.sort((a, b) => b.count - a.count);
  return { supported: true, scanned: photos.length, clusters: clusters.slice(0, 24).map(({ centroid, ...cluster }) => cluster) };
}
