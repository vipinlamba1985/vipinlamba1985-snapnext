import crypto from 'crypto';
import { storage } from './storage.js';
import {
  FREE_STORY_AUDIO_TRACKS,
  soundtrackCanBeEmbedded,
  soundtrackLicenseSnapshot,
} from './ready-story-audio.js';

export const CANONICAL_REEL_MAX_DURATION_MS = 60_000;
export const CANONICAL_REEL_MAX_SCENES = 20;
export const CANONICAL_REEL_MAX_OUTPUT_BYTES = 250 * 1024 * 1024;
export const CANONICAL_REEL_SOURCE_URL_TTL_SEC = 30 * 60;
export const CANONICAL_REEL_OUTPUT_URL_TTL_SEC = 30 * 60;
export const CANONICAL_REEL_PROVIDER_ACCEPT_TIMEOUT_MS = 10_000;

const OUTPUT_SPECS = Object.freeze({
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
});

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizedHash(value) {
  return String(value || '').trim().toLowerCase();
}

function trackForManifestMusic(music = null) {
  if (!music?.trackId) return null;
  return FREE_STORY_AUDIO_TRACKS.find(track => track.id === music.trackId) || null;
}

export function canonicalRenderOutputSpec(aspectRatio = '9:16') {
  const dimensions = OUTPUT_SPECS[aspectRatio] || null;
  if (!dimensions) return null;
  return {
    container: 'mp4',
    videoCodec: 'h264',
    h264Profile: 'high',
    pixelFormat: 'yuv420p',
    fps: 30,
    audioCodec: 'aac',
    audioSampleRateHz: 44_100,
    audioBitrateKbps: 128,
    fastStart: true,
    ...dimensions,
  };
}

export function validateCanonicalRenderExecution(manifest = {}) {
  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  if (!scenes.length) return { ok: false, reason: 'render_manifest_empty' };
  if (scenes.length > CANONICAL_REEL_MAX_SCENES) {
    return { ok: false, reason: 'render_scene_limit_exceeded', limit: CANONICAL_REEL_MAX_SCENES };
  }
  const durationMs = Number(manifest.totalDurationMs || scenes.reduce((sum, scene) => sum + Number(scene.durationMs || 0), 0));
  if (!Number.isFinite(durationMs) || durationMs <= 0) return { ok: false, reason: 'render_duration_invalid' };
  if (durationMs > CANONICAL_REEL_MAX_DURATION_MS) {
    return { ok: false, reason: 'render_duration_limit_exceeded', limitMs: CANONICAL_REEL_MAX_DURATION_MS };
  }
  const output = canonicalRenderOutputSpec(manifest.aspectRatio);
  if (!output) return { ok: false, reason: 'render_aspect_ratio_unsupported' };

  if (manifest.music?.trackId) {
    const track = trackForManifestMusic(manifest.music);
    if (!track || !soundtrackCanBeEmbedded(track)) return { ok: false, reason: 'render_music_not_exportable' };
    if (!track.contentHash || normalizedHash(manifest.music.contentHash) !== normalizedHash(track.contentHash)) {
      return { ok: false, reason: 'render_music_hash_mismatch' };
    }
    const expectedLicense = soundtrackLicenseSnapshot(track);
    if (manifest.music.licenseSnapshot !== expectedLicense) {
      return { ok: false, reason: 'render_music_license_snapshot_mismatch' };
    }
  }

  return { ok: true, durationMs, sceneCount: scenes.length, output };
}

export function estimateCanonicalRenderCostUsd(manifest = {}, env = process.env) {
  const decision = validateCanonicalRenderExecution(manifest);
  if (!decision.ok) return null;
  const baseUsd = positiveNumber(env.CREATE_RENDER_BASE_COST_USD, 0.01);
  const perMinuteUsd = positiveNumber(env.CREATE_RENDER_COST_PER_MINUTE_USD, 0.12);
  const perSceneUsd = positiveNumber(env.CREATE_RENDER_COST_PER_SCENE_USD, 0.0015);
  const raw = baseUsd
    + (decision.durationMs / 60_000) * perMinuteUsd
    + decision.sceneCount * perSceneUsd;
  return Math.ceil(raw * 10_000) / 10_000;
}

export function canonicalRenderProviderStatus(env = process.env, storageProvider = storage.active()) {
  const missing = [];
  if (!env.CREATE_RENDER_PROVIDER_URL) missing.push('CREATE_RENDER_PROVIDER_URL');
  if (!env.CREATE_RENDER_PROVIDER_KEY || String(env.CREATE_RENDER_PROVIDER_KEY).length < 16) missing.push('CREATE_RENDER_PROVIDER_KEY');
  if (!env.CREATE_RENDER_CALLBACK_SECRET || String(env.CREATE_RENDER_CALLBACK_SECRET).length < 32) missing.push('CREATE_RENDER_CALLBACK_SECRET');
  if (!env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
  if (!env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!env.AWS_REGION) missing.push('AWS_REGION');
  if (!env.AWS_S3_BUCKET) missing.push('AWS_S3_BUCKET');
  if (storageProvider !== 's3') missing.push('STORAGE_PROVIDER=s3');
  return { ready: missing.length === 0, missing };
}

export function renderCallbackSecretMatches(provided, expected = process.env.CREATE_RENDER_CALLBACK_SECRET) {
  const actual = String(provided || '');
  const secret = String(expected || '');
  if (secret.length < 32 || actual.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(secret));
}

function assertRenderStorageKey(storageKey) {
  const key = String(storageKey || '');
  if (!/^renders\/[a-f0-9]{32}\/[a-f0-9]{64}\.mp4$/.test(key)) {
    const error = new Error('Invalid canonical render storage key.');
    error.code = 'render_storage_key_invalid';
    throw error;
  }
  return key;
}

async function signedRenderUploadUrl(storageKey, env = process.env) {
  const key = assertRenderStorageKey(storageKey);
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
  const url = await getSignedUrl(client, new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: 'video/mp4',
  }), { expiresIn: CANONICAL_REEL_OUTPUT_URL_TTL_SEC });
  return url;
}

export async function buildCanonicalRenderProviderPayload({
  db,
  userId,
  artifact,
  callbackUrl,
  env = process.env,
  storageAdapter = storage,
}) {
  if (!db || !userId || !artifact?.canonicalManifest) throw new Error('Render job context is incomplete.');
  const decision = validateCanonicalRenderExecution(artifact.canonicalManifest);
  if (!decision.ok) {
    const error = new Error(`Canonical render execution rejected: ${decision.reason}`);
    error.code = decision.reason;
    throw error;
  }

  const sourceIds = [...new Set((artifact.sourceMediaIds || []).map(String).filter(Boolean))];
  const mediaDocs = await db.collection('media').find({
    userId,
    id: { $in: sourceIds },
    trashed: { $ne: true },
  }).toArray();
  const byId = new Map(mediaDocs.map(doc => [String(doc.id), doc]));
  const sources = [];

  for (const mediaId of sourceIds) {
    const media = byId.get(mediaId);
    if (!media?.storageKey) {
      const error = new Error(`Render source is unavailable: ${mediaId}`);
      error.code = 'render_source_unavailable';
      throw error;
    }
    const readUrl = await storageAdapter.getReadUrl({
      provider: media.provider || 's3',
      storageKey: media.storageKey,
      expiresSec: CANONICAL_REEL_SOURCE_URL_TTL_SEC,
    });
    if (!readUrl) {
      const error = new Error(`Render source cannot be signed: ${mediaId}`);
      error.code = 'render_source_url_unavailable';
      throw error;
    }
    sources.push({
      mediaId,
      kind: media.kind === 'video' ? 'video' : 'photo',
      mimeType: media.mime || media.mimeType || (media.kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      sizeBytes: Number(media.size || media.bytes || 0),
      contentHash: artifact.sourceContentHashes?.[mediaId] || '',
      readUrl,
    });
  }

  let music = null;
  if (artifact.canonicalManifest.music?.trackId) {
    const track = trackForManifestMusic(artifact.canonicalManifest.music);
    music = {
      trackId: track.id,
      readUrl: track.mp3Url || track.audioUrl,
      contentHash: track.contentHash,
      licenseSnapshot: soundtrackLicenseSnapshot(track),
    };
  }

  const uploadUrl = await signedRenderUploadUrl(artifact.storageKey, env);
  return {
    contract: 'snapnext-canonical-reel-v1',
    jobId: artifact.id,
    artifactId: artifact._id,
    manifestHash: artifact.manifestHash,
    manifest: artifact.canonicalManifest,
    sources,
    music,
    output: {
      provider: 's3',
      storageKey: artifact.storageKey,
      uploadUrl,
      contentType: 'video/mp4',
      ...decision.output,
    },
    callback: {
      url: callbackUrl,
      authentication: 'Bearer CREATE_RENDER_CALLBACK_SECRET',
    },
  };
}

export function validateCanonicalRenderProbe({ manifest = {}, probe = {}, outputBytes = 0 }) {
  const decision = validateCanonicalRenderExecution(manifest);
  if (!decision.ok) return decision;
  const bytes = Number(outputBytes);
  if (!Number.isFinite(bytes) || bytes < 10_000 || bytes > CANONICAL_REEL_MAX_OUTPUT_BYTES) {
    return { ok: false, reason: 'render_output_size_invalid' };
  }

  const container = String(probe.container || '').toLowerCase();
  if (!['mp4', 'mov,mp4,m4a,3gp,3g2,mj2'].includes(container)) return { ok: false, reason: 'render_container_invalid' };
  const videoCodec = String(probe.videoCodec || '').toLowerCase();
  if (!['h264', 'avc', 'avc1'].includes(videoCodec)) return { ok: false, reason: 'render_video_codec_invalid' };
  if (String(probe.pixelFormat || '').toLowerCase() !== 'yuv420p') return { ok: false, reason: 'render_pixel_format_invalid' };
  if (Number(probe.width) !== decision.output.width || Number(probe.height) !== decision.output.height) {
    return { ok: false, reason: 'render_dimensions_invalid' };
  }
  const fps = Number(probe.fps);
  if (!Number.isFinite(fps) || Math.abs(fps - decision.output.fps) > 0.1) return { ok: false, reason: 'render_fps_invalid' };
  const durationMs = Number(probe.durationMs);
  const toleranceMs = Math.max(250, decision.durationMs * 0.02);
  if (!Number.isFinite(durationMs) || Math.abs(durationMs - decision.durationMs) > toleranceMs) {
    return { ok: false, reason: 'render_duration_mismatch' };
  }
  if (manifest.music?.trackId && String(probe.audioCodec || '').toLowerCase() !== 'aac') {
    return { ok: false, reason: 'render_audio_codec_invalid' };
  }
  if (probe.fastStart !== true) return { ok: false, reason: 'render_faststart_missing' };

  return {
    ok: true,
    normalized: {
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: String(probe.audioCodec || 'none').toLowerCase(),
      pixelFormat: 'yuv420p',
      width: decision.output.width,
      height: decision.output.height,
      fps,
      durationMs,
      fastStart: true,
      outputBytes: bytes,
    },
  };
}
