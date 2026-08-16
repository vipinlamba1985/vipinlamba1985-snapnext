import crypto from 'crypto';

export const CREATE_MANIFEST_VERSION = 1;
export const CREATE_RENDER_CONTRACT_VERSION = 1;
export const CREATE_RENDERER_OUTPUT_VERSION = 1;

export const CANONICAL_RENDER_FIELDS = Object.freeze([
  'scene order',
  'scene duration',
  'crop and framing',
  'video in and out points',
  'text content and placement',
  'music track and sync offsets',
  'total duration',
  'aspect ratio',
]);

export const COSMETIC_RENDER_FIELDS = Object.freeze([
  'encoding quality',
  'transition interpolation',
  'font rasterization and anti-aliasing',
]);

const SUPPORTED_MANIFEST_VERSIONS = new Set([CREATE_MANIFEST_VERSION]);
const ASPECT_RATIOS = new Set(['9:16', '16:9', '1:1', '4:5']);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function bounded(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function rounded(value, precision = 6) {
  const scale = 10 ** precision;
  return Math.round(finiteNumber(value, 0) * scale) / scale;
}

function cleanText(value, max = 10_000) {
  return String(value ?? '').replace(/\r\n/g, '\n').slice(0, max);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter(key => value[key] !== undefined)
      .map(key => [key, stableValue(value[key])]),
  );
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function normalizeCrop(crop = {}) {
  const mode = ['cover', 'contain'].includes(crop?.mode) ? crop.mode : 'cover';
  return {
    mode,
    focalX: rounded(bounded(crop?.focalX, 0.5, 0, 1)),
    focalY: rounded(bounded(crop?.focalY, 0.5, 0, 1)),
    zoom: rounded(bounded(crop?.zoom, 1, 1, 8)),
    rotationDeg: rounded(bounded(crop?.rotationDeg, 0, -360, 360)),
  };
}

function normalizeTextLayer(layer = {}, index = 0) {
  return {
    id: cleanText(layer?.id || `text-${index}`, 120),
    text: cleanText(layer?.text, 2_000),
    x: rounded(bounded(layer?.x, 0.5, 0, 1)),
    y: rounded(bounded(layer?.y, 0.85, 0, 1)),
    width: rounded(bounded(layer?.width, 0.86, 0.01, 1)),
    align: ['left', 'center', 'right'].includes(layer?.align) ? layer.align : 'center',
    fontFamily: cleanText(layer?.fontFamily || 'system-ui', 120),
    fontWeight: bounded(layer?.fontWeight, 600, 100, 900),
    fontSize: rounded(bounded(layer?.fontSize, 0.05, 0.005, 0.5)),
    lineHeight: rounded(bounded(layer?.lineHeight, 1.15, 0.5, 3)),
  };
}

function normalizeTransition(transition = {}) {
  return {
    type: cleanText(transition?.type || 'crossfade', 80),
    durationMs: Math.round(bounded(transition?.durationMs, 350, 0, 5_000)),
  };
}

function normalizeScene(scene = {}, index = 0) {
  const kind = scene?.kind === 'video' ? 'video' : 'photo';
  const sourceMediaId = cleanText(scene?.sourceMediaId || scene?.mediaId, 200);
  const contentHash = cleanText(scene?.contentHash || scene?.sourceContentHash, 256).toLowerCase();
  const durationMs = Math.round(bounded(scene?.durationMs, 3_500, 100, 120_000));
  const videoInMs = kind === 'video' ? Math.round(bounded(scene?.videoInMs, 0, 0, Number.MAX_SAFE_INTEGER)) : 0;
  const videoOutMs = kind === 'video'
    ? Math.round(bounded(scene?.videoOutMs, videoInMs + durationMs, videoInMs + 1, Number.MAX_SAFE_INTEGER))
    : 0;

  return {
    index,
    kind,
    sourceMediaId,
    contentHash,
    durationMs,
    crop: normalizeCrop(scene?.crop),
    videoInMs,
    videoOutMs,
    textLayers: (Array.isArray(scene?.textLayers) ? scene.textLayers : []).map(normalizeTextLayer),
    transition: normalizeTransition(scene?.transition),
    visual: {
      filter: cleanText(scene?.visual?.filter || 'none', 80),
      brightness: rounded(bounded(scene?.visual?.brightness, 1, 0, 4)),
      contrast: rounded(bounded(scene?.visual?.contrast, 1, 0, 4)),
      saturation: rounded(bounded(scene?.visual?.saturation, 1, 0, 4)),
    },
  };
}

function normalizeMusic(music = null) {
  if (!music?.trackId) return null;
  return {
    trackId: cleanText(music.trackId, 200),
    contentHash: cleanText(music.contentHash, 256).toLowerCase(),
    offsetMs: Math.round(bounded(music.offsetMs, 0, 0, Number.MAX_SAFE_INTEGER)),
    trimInMs: Math.round(bounded(music.trimInMs, 0, 0, Number.MAX_SAFE_INTEGER)),
    volume: rounded(bounded(music.volume, 0.28, 0, 1)),
    licenseSnapshot: cleanText(music.licenseSnapshot || '', 500),
  };
}

export function canonicalizeCreateManifest(manifest = {}) {
  const manifestVersion = Math.floor(finiteNumber(manifest?.manifestVersion, CREATE_MANIFEST_VERSION));
  if (!SUPPORTED_MANIFEST_VERSIONS.has(manifestVersion)) {
    const error = new Error(`Unsupported Create manifest version: ${manifestVersion}`);
    error.code = 'create_manifest_version_unsupported';
    throw error;
  }

  const scenes = (Array.isArray(manifest?.scenes) ? manifest.scenes : []).map(normalizeScene);
  const totalDurationMs = scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
  const aspectRatio = ASPECT_RATIOS.has(manifest?.aspectRatio) ? manifest.aspectRatio : '9:16';

  return {
    manifestVersion,
    renderContractVersion: Math.floor(finiteNumber(manifest?.renderContractVersion, CREATE_RENDER_CONTRACT_VERSION)),
    rendererOutputVersion: Math.floor(finiteNumber(manifest?.rendererOutputVersion, CREATE_RENDERER_OUTPUT_VERSION)),
    aspectRatio,
    totalDurationMs,
    scenes,
    music: normalizeMusic(manifest?.music),
  };
}

export function validateCanonicalCreateManifest(manifest = {}) {
  const canonical = canonicalizeCreateManifest(manifest);
  if (!canonical.scenes.length) {
    return { ok: false, code: 'create_manifest_empty', canonical };
  }
  for (const scene of canonical.scenes) {
    if (!scene.sourceMediaId) return { ok: false, code: 'create_manifest_source_missing', canonical };
    if (!scene.contentHash) return { ok: false, code: 'create_manifest_source_hash_missing', canonical };
    if (scene.kind === 'video' && scene.videoOutMs <= scene.videoInMs) {
      return { ok: false, code: 'create_manifest_video_range_invalid', canonical };
    }
  }
  if (canonical.music?.trackId && !canonical.music.contentHash) {
    return { ok: false, code: 'create_manifest_music_hash_missing', canonical };
  }
  return { ok: true, canonical };
}

export function createManifestHash(manifest = {}) {
  const { ok, code, canonical } = validateCanonicalCreateManifest(manifest);
  if (!ok) {
    const error = new Error(`Create manifest is not exportable: ${code}`);
    error.code = code;
    throw error;
  }
  return crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
}

export function renderArtifactDocumentId(userId, manifestHash) {
  return crypto.createHash('sha256').update(`${String(userId || '')}\0${String(manifestHash || '')}`).digest('hex');
}

export function renderArtifactStorageKey(userId, manifestHash) {
  const owner = crypto.createHash('sha256').update(String(userId || '')).digest('hex').slice(0, 32);
  return `renders/${owner}/${String(manifestHash || '')}.mp4`;
}

export function pinCreateManifest(manifest = {}) {
  return canonicalizeCreateManifest({
    ...manifest,
    manifestVersion: manifest?.manifestVersion ?? CREATE_MANIFEST_VERSION,
    renderContractVersion: manifest?.renderContractVersion ?? CREATE_RENDER_CONTRACT_VERSION,
    rendererOutputVersion: manifest?.rendererOutputVersion ?? CREATE_RENDERER_OUTPUT_VERSION,
  });
}

export function createManifestRevisionForEdit(manifest = {}, changes = {}) {
  return canonicalizeCreateManifest({
    ...manifest,
    ...changes,
    manifestVersion: CREATE_MANIFEST_VERSION,
    renderContractVersion: CREATE_RENDER_CONTRACT_VERSION,
    rendererOutputVersion: CREATE_RENDERER_OUTPUT_VERSION,
  });
}
