import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_REEL_MAX_DURATION_MS,
  CANONICAL_REEL_MAX_SCENES,
  canonicalRenderOutputSpec,
  canonicalRenderProviderStatus,
  estimateCanonicalRenderCostUsd,
  renderCallbackSecretMatches,
  validateCanonicalRenderExecution,
  validateCanonicalRenderProbe,
} from '../lib/create-render-execution.server.js';
import {
  FREE_STORY_AUDIO_TRACKS,
  soundtrackLicenseSnapshot,
} from '../lib/ready-story-audio.js';

function manifest(overrides = {}) {
  return {
    manifestVersion: 1,
    renderContractVersion: 1,
    rendererOutputVersion: 1,
    aspectRatio: '9:16',
    totalDurationMs: 7_000,
    scenes: [
      {
        index: 0,
        kind: 'photo',
        sourceMediaId: 'media-1',
        contentHash: 'abc123',
        durationMs: 3_500,
        crop: { mode: 'cover', focalX: 0.5, focalY: 0.5, zoom: 1, rotationDeg: 0 },
        videoInMs: 0,
        videoOutMs: 0,
        textLayers: [],
        transition: { type: 'crossfade', durationMs: 350 },
        visual: { filter: 'none', brightness: 1, contrast: 1, saturation: 1 },
      },
      {
        index: 1,
        kind: 'photo',
        sourceMediaId: 'media-2',
        contentHash: 'def456',
        durationMs: 3_500,
        crop: { mode: 'cover', focalX: 0.5, focalY: 0.5, zoom: 1, rotationDeg: 0 },
        videoInMs: 0,
        videoOutMs: 0,
        textLayers: [],
        transition: { type: 'crossfade', durationMs: 350 },
        visual: { filter: 'none', brightness: 1, contrast: 1, saturation: 1 },
      },
    ],
    music: null,
    ...overrides,
  };
}

test('C1 keeps canonical Reel execution bounded', () => {
  assert.equal(CANONICAL_REEL_MAX_DURATION_MS, 60_000);
  assert.equal(CANONICAL_REEL_MAX_SCENES, 20);
  assert.equal(validateCanonicalRenderExecution(manifest()).ok, true);

  const tooLong = manifest({ totalDurationMs: 60_001 });
  assert.equal(validateCanonicalRenderExecution(tooLong).reason, 'render_duration_limit_exceeded');

  const tooManyScenes = manifest({ scenes: Array.from({ length: 21 }, (_, index) => ({
    ...manifest().scenes[0],
    index,
    sourceMediaId: `media-${index}`,
  })) });
  assert.equal(validateCanonicalRenderExecution(tooManyScenes).reason, 'render_scene_limit_exceeded');
});

test('C1 canonical output is mobile-safe H.264/AAC MP4', () => {
  assert.deepEqual(canonicalRenderOutputSpec('9:16'), {
    container: 'mp4',
    videoCodec: 'h264',
    h264Profile: 'high',
    pixelFormat: 'yuv420p',
    fps: 30,
    audioCodec: 'aac',
    audioSampleRateHz: 44_100,
    audioBitrateKbps: 128,
    fastStart: true,
    width: 1080,
    height: 1920,
  });
});

test('C1 reserves a positive conservative render estimate', () => {
  const estimated = estimateCanonicalRenderCostUsd(manifest(), {
    CREATE_RENDER_BASE_COST_USD: '0.01',
    CREATE_RENDER_COST_PER_MINUTE_USD: '0.12',
    CREATE_RENDER_COST_PER_SCENE_USD: '0.0015',
  });
  assert.ok(estimated > 0.01);
  assert.ok(estimated < 0.1);
});

test('C1 pins soundtrack checksum and license snapshot before export', () => {
  const track = FREE_STORY_AUDIO_TRACKS[0];
  assert.match(track.contentHash, /^sha1:[a-f0-9]{40}$/);
  const withMusic = manifest({
    music: {
      trackId: track.id,
      contentHash: track.contentHash,
      offsetMs: 0,
      trimInMs: 0,
      volume: 0.28,
      licenseSnapshot: soundtrackLicenseSnapshot(track),
    },
  });
  assert.equal(validateCanonicalRenderExecution(withMusic).ok, true);
  assert.equal(validateCanonicalRenderExecution({
    ...withMusic,
    music: { ...withMusic.music, contentHash: 'sha1:0000000000000000000000000000000000000000' },
  }).reason, 'render_music_hash_mismatch');
});

test('C1 rejects renderer output that is not the canonical MP4 contract', () => {
  const valid = validateCanonicalRenderProbe({
    manifest: manifest(),
    outputBytes: 1_000_000,
    probe: {
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'none',
      pixelFormat: 'yuv420p',
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 7_000,
      fastStart: true,
    },
  });
  assert.equal(valid.ok, true);
  assert.equal(validateCanonicalRenderProbe({
    manifest: manifest(),
    outputBytes: 1_000_000,
    probe: { ...valid.normalized, videoCodec: 'vp9' },
  }).reason, 'render_video_codec_invalid');
  assert.equal(validateCanonicalRenderProbe({
    manifest: manifest(),
    outputBytes: 1_000_000,
    probe: { ...valid.normalized, durationMs: 8_000 },
  }).reason, 'render_duration_mismatch');
});

test('C1 renderer configuration fails closed and callback comparison is constant-length', () => {
  const env = {
    CREATE_RENDER_PROVIDER_URL: 'https://renderer.example.test/jobs',
    CREATE_RENDER_PROVIDER_KEY: 'provider-key-123456789',
    CREATE_RENDER_CALLBACK_SECRET: '12345678901234567890123456789012',
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
    AWS_REGION: 'us-east-1',
    AWS_S3_BUCKET: 'bucket',
  };
  assert.equal(canonicalRenderProviderStatus(env, 's3').ready, true);
  assert.equal(canonicalRenderProviderStatus({ ...env, CREATE_RENDER_CALLBACK_SECRET: '' }, 's3').ready, false);
  assert.equal(canonicalRenderProviderStatus(env, 'local').ready, false);
  assert.equal(renderCallbackSecretMatches(env.CREATE_RENDER_CALLBACK_SECRET, env.CREATE_RENDER_CALLBACK_SECRET), true);
  assert.equal(renderCallbackSecretMatches('wrong', env.CREATE_RENDER_CALLBACK_SECRET), false);
});
