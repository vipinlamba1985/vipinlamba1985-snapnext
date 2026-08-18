import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { validateCanonicalCreateManifest } from '@/lib/create-render-contract';
import {
  canonicalRenderProviderStatus,
  validateCanonicalRenderExecution,
} from '@/lib/create-render-execution.server';
import { getCanonicalRenderQuotaSnapshot } from '@/lib/create-render-quota';
import {
  FREE_STORY_AUDIO_TRACKS,
  soundtrackCanBeEmbedded,
  soundtrackLicenseSnapshot,
} from '@/lib/ready-story-audio';

export const runtime = 'nodejs';

const MAX_SCENES = 20;
const DEFAULT_SCENE_MS = 3500;
const MAX_TOTAL_MS = 60000;
const ASPECT_RATIOS = new Set(['9:16', '16:9', '1:1', '4:5']);

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function cleanMediaIds(values = []) {
  const seen = new Set();
  const ids = [];
  for (const value of Array.isArray(values) ? values : []) {
    const id = String(value || '').trim();
    if (!id || id.length > 200 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_SCENES) break;
  }
  return ids;
}

function contentHash(doc = {}) {
  return String(doc.hash || doc.sha256 || doc.contentHash || '').trim().toLowerCase();
}

function mediaDurationMs(doc = {}) {
  const directMs = [doc.durationMs, doc.videoDurationMs, doc.metadata?.durationMs]
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0);
  if (directMs) return Math.round(directMs);

  const generic = [doc.duration, doc.durationSec, doc.metadata?.duration]
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0);
  if (!generic) return null;
  return Math.round(generic > 600 ? generic : generic * 1000);
}

function safeMedia(doc = {}) {
  return {
    id: String(doc.id || ''),
    kind: doc.kind === 'video' ? 'video' : 'photo',
    name: String(doc.name || doc.filename || 'Saved memory').slice(0, 180),
    createdAt: doc.capturedAt || doc.takenAt || doc.createdAt || doc.uploadedAt || null,
  };
}

function soundtrackForExport(includeMusic) {
  if (!includeMusic) return null;
  const track = FREE_STORY_AUDIO_TRACKS.find((item) => soundtrackCanBeEmbedded(item)) || null;
  if (!track) return null;
  return {
    trackId: track.id,
    contentHash: track.contentHash,
    offsetMs: 0,
    trimInMs: 0,
    volume: 0.28,
    licenseSnapshot: soundtrackLicenseSnapshot(track),
  };
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const mediaIds = cleanMediaIds(body.mediaIds);
  if (!mediaIds.length) return json({ error: 'Choose at least one memory for the Reel.', code: 'reel_sources_required' }, 400);

  const aspectRatio = ASPECT_RATIOS.has(body.aspectRatio) ? body.aspectRatio : '9:16';
  const includeMusic = body.includeMusic !== false;
  const requestedSceneMs = Math.min(5000, Math.max(1500, Math.round(Number(body.sceneDurationMs) || DEFAULT_SCENE_MS)));
  const maxPerSceneMs = Math.max(500, Math.floor(MAX_TOTAL_MS / mediaIds.length));

  const db = await getDb();
  const docs = await db.collection('media').find({
    userId: user.id,
    id: { $in: mediaIds },
    trashed: { $ne: true },
    kind: { $in: ['photo', 'video'] },
  }).project({
    _id: 0,
    id: 1,
    kind: 1,
    name: 1,
    filename: 1,
    hash: 1,
    sha256: 1,
    contentHash: 1,
    durationMs: 1,
    videoDurationMs: 1,
    duration: 1,
    durationSec: 1,
    metadata: 1,
    capturedAt: 1,
    takenAt: 1,
    createdAt: 1,
    uploadedAt: 1,
  }).toArray();

  const byId = new Map(docs.map((doc) => [String(doc.id), doc]));
  const ordered = mediaIds.map((id) => byId.get(id)).filter(Boolean);
  if (ordered.length !== mediaIds.length) {
    return json({ error: 'One or more selected memories are no longer available.', code: 'reel_source_unavailable' }, 409);
  }

  const missingHashes = ordered.filter((doc) => !contentHash(doc)).map((doc) => String(doc.id));
  if (missingHashes.length) {
    return json({
      error: 'One or more selected memories are still being verified for export. Try again shortly.',
      code: 'reel_source_hash_unavailable',
      unavailableCount: missingHashes.length,
    }, 409);
  }

  const scenes = ordered.map((doc, index) => {
    const knownDuration = doc.kind === 'video' ? mediaDurationMs(doc) : null;
    const durationMs = Math.max(
      250,
      Math.min(requestedSceneMs, maxPerSceneMs, knownDuration || requestedSceneMs),
    );
    return {
      index,
      kind: doc.kind === 'video' ? 'video' : 'photo',
      sourceMediaId: String(doc.id),
      contentHash: contentHash(doc),
      durationMs,
      crop: { mode: 'cover', focalX: 0.5, focalY: 0.5, zoom: 1, rotationDeg: 0 },
      videoInMs: 0,
      videoOutMs: doc.kind === 'video' ? durationMs : 0,
      textLayers: [],
      transition: { type: 'crossfade', durationMs: 350 },
      visual: { filter: 'none', brightness: 1, contrast: 1, saturation: 1 },
    };
  });

  const manifest = {
    manifestVersion: 1,
    renderContractVersion: 1,
    rendererOutputVersion: 1,
    aspectRatio,
    scenes,
    music: soundtrackForExport(includeMusic),
  };

  const validation = validateCanonicalCreateManifest(manifest);
  if (!validation.ok) {
    return json({ error: 'This Reel could not be prepared safely.', code: validation.code }, 400);
  }
  const execution = validateCanonicalRenderExecution(validation.canonical);
  if (!execution.ok) {
    return json({ error: 'This Reel exceeds the current export limits.', code: execution.reason }, 400);
  }

  const [quota, renderer] = await Promise.all([
    getCanonicalRenderQuotaSnapshot({ db, userId: user.id, planId: user.plan || 'free' }),
    Promise.resolve(canonicalRenderProviderStatus()),
  ]);

  return json({
    ok: true,
    manifest: validation.canonical,
    sources: ordered.map(safeMedia),
    preview: {
      sceneCount: execution.sceneCount,
      durationMs: execution.durationMs,
      aspectRatio,
      soundtrack: validation.canonical.music?.trackId ? 'Chill Beat' : null,
      includedWithPlan: true,
      quota: {
        allowed: quota.allowed === true,
        used: Number(quota.used || 0),
        reserved: Number(quota.reserved || 0),
        limit: Number(quota.limit || 0),
        remaining: Number(quota.remaining || 0),
        unlimited: quota.unlimited === true,
      },
      rendererReady: renderer.ready === true,
    },
    note: 'Preview preparation verifies ownership, source hashes, duration limits and soundtrack license without reserving quota or calling an AI provider.',
  });
}
