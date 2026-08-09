import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VERSION = '1.0.0';
const ROOT = path.resolve(process.cwd(), 'public', 'vendor', 'mediapipe', 'tasks-vision', VERSION);

const ASSETS = [
  {
    path: 'vision_bundle.mjs',
    url: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`,
    minBytes: 100_000,
  },
  {
    path: 'wasm/vision_wasm_internal.js',
    url: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm/vision_wasm_internal.js`,
    minBytes: 10_000,
  },
  {
    path: 'wasm/vision_wasm_internal.wasm',
    url: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm/vision_wasm_internal.wasm`,
    minBytes: 500_000,
  },
  {
    path: 'wasm/vision_wasm_nosimd_internal.js',
    url: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm/vision_wasm_nosimd_internal.js`,
    minBytes: 10_000,
  },
  {
    path: 'wasm/vision_wasm_nosimd_internal.wasm',
    url: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm/vision_wasm_nosimd_internal.wasm`,
    minBytes: 500_000,
  },
  {
    path: 'models/blaze_face_full_range_float16_v1.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite',
    minBytes: 100_000,
  },
];

async function validExisting(file, minBytes) {
  try {
    return (await stat(file)).size >= minBytes;
  } catch {
    return false;
  }
}

async function download(asset) {
  const destination = path.join(ROOT, asset.path);
  await mkdir(path.dirname(destination), { recursive: true });
  if (await validExisting(destination, asset.minBytes)) return destination;

  const response = await fetch(asset.url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Could not stage ${asset.path}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < asset.minBytes) throw new Error(`Staged ${asset.path} is unexpectedly small (${bytes.length} bytes).`);

  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  return destination;
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

await mkdir(ROOT, { recursive: true });
const manifest = { version: VERSION, generatedAt: new Date().toISOString(), assets: {} };
for (const asset of ASSETS) {
  const file = await download(asset);
  const info = await stat(file);
  manifest.assets[asset.path] = { bytes: info.size, sha256: await sha256(file) };
}
await writeFile(path.join(ROOT, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[mediapipe-assets] staged ${ASSETS.length} versioned static assets at /vendor/mediapipe/tasks-vision/${VERSION}`);
