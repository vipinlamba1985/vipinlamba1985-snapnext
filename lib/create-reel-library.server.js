import crypto from 'crypto';
import { storage } from './storage.js';
import { deleteStoredMediaVerified } from './storage-strict-delete.js';
import { canonicalRenderAccountingComplete } from './create-render-accounting.server.js';
import { mediaDeletionGenerationIsCurrent } from './media-deletion-generation.server.js';
import { resolveStorageScope, getStorageScopeUsage } from './storage-scope.js';

export const CREATE_REEL_LIBRARY_ORIGIN = 'canonical-reel-v1';
export const CREATE_REEL_LIBRARY_VERSION = 1;

const MAX_LIBRARY_REEL_BYTES = 250 * 1024 * 1024;

export class CreateReelLibraryError extends Error {
  constructor(message, status = 409, code = 'create_reel_library_unavailable') {
    super(message);
    this.name = 'CreateReelLibraryError';
    this.status = status;
    this.code = code;
  }
}

function cleanMedia(doc) {
  if (!doc) return null;
  const { _id, ...safe } = doc;
  return safe;
}

function safeIdPart(value = '') {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
}

export function canonicalReelLibraryMediaId(artifact = {}) {
  const artifactId = safeIdPart(artifact.id);
  if (!artifactId) throw new CreateReelLibraryError('Rendered Reel identity is missing.', 409, 'render_artifact_identity_missing');
  return `reel-${artifactId}`;
}

export function canonicalReelLibraryDocumentId(userId, artifact = {}) {
  const owner = safeIdPart(userId);
  const artifactId = safeIdPart(artifact.id);
  if (!owner || !artifactId) throw new CreateReelLibraryError('Rendered Reel identity is incomplete.', 409, 'render_artifact_identity_missing');
  return `created-reel:${owner}:${artifactId}`;
}

export function canonicalReelLogicalContentHash(artifact = {}) {
  const manifestHash = String(artifact.manifestHash || '').trim().toLowerCase();
  const outputBytes = Number(artifact.outputBytes || 0);
  const outputVersion = Number(artifact.rendererOutputVersion || artifact.canonicalManifest?.rendererOutputVersion || 1);
  if (!manifestHash || !Number.isFinite(outputBytes) || outputBytes <= 0) {
    throw new CreateReelLibraryError('Rendered Reel identity is incomplete.', 409, 'render_artifact_identity_missing');
  }
  return crypto
    .createHash('sha256')
    .update(`snapnext-library-reel-v${CREATE_REEL_LIBRARY_VERSION}:${manifestHash}:${outputBytes}:${outputVersion}`)
    .digest('hex');
}

function totalDurationMs(artifact = {}) {
  const manifest = artifact.canonicalManifest || {};
  const direct = Number(manifest.totalDurationMs || 0);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
  return Math.max(0, Math.round((manifest.scenes || []).reduce((sum, scene) => sum + Number(scene?.durationMs || 0), 0)));
}

function sourceMediaIds(artifact = {}) {
  return [...new Set((artifact.sourceMediaIds || []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, 20);
}

function encodeCopySource(bucket, storageKey) {
  return `${encodeURIComponent(bucket)}/${String(storageKey || '').split('/').map(segment => encodeURIComponent(segment)).join('/')}`;
}

async function copyS3Object({ userId, mediaId, sourceStorageKey, expectedSize, sourceEtag = null }) {
  const bucket = String(process.env.AWS_S3_BUCKET || '').trim();
  const region = String(process.env.AWS_REGION || '').trim();
  const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new CreateReelLibraryError('SnapNext storage is not ready to save this Reel.', 503, 'reel_library_storage_not_configured');
  }

  const destinationKey = `users/${userId}/media/${mediaId}/snapnext-memory-reel.mp4`;
  const { S3Client, CopyObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  let copyCreated = false;
  try {
    await client.send(new CopyObjectCommand({
      Bucket: bucket,
      Key: destinationKey,
      CopySource: encodeCopySource(bucket, sourceStorageKey),
      ...(sourceEtag ? { CopySourceIfMatch: sourceEtag } : {}),
      MetadataDirective: 'REPLACE',
      ContentType: 'video/mp4',
      Metadata: {
        'snapnext-origin': CREATE_REEL_LIBRARY_ORIGIN,
        'snapnext-media-id': mediaId,
      },
    }));
    copyCreated = true;
    const verified = await storage.verify({ provider: 's3', storageKey: destinationKey, expectedSize });
    if (verified.contentType && String(verified.contentType).toLowerCase() !== 'video/mp4') {
      throw new CreateReelLibraryError('Saved Reel media type could not be verified.', 503, 'reel_library_copy_type_invalid');
    }
    return { provider: 's3', storageKey: destinationKey, size: verified.size };
  } catch (error) {
    if (copyCreated) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: destinationKey })).catch(() => null);
    }
    throw error;
  }
}

async function copyCanonicalRenderOutput({ userId, mediaId, artifact, expectedSize, sourceVerification }) {
  const provider = artifact.provider || 's3';
  if (provider === 's3') {
    return copyS3Object({
      userId,
      mediaId,
      sourceStorageKey: artifact.storageKey,
      expectedSize,
      sourceEtag: sourceVerification?.etag || null,
    });
  }

  const buffer = await storage.read({ provider, storageKey: artifact.storageKey });
  if (buffer.length !== expectedSize) {
    throw new CreateReelLibraryError('Rendered Reel changed before it could be saved.', 409, 'reel_library_source_size_changed');
  }
  return storage.save({
    userId,
    fileId: mediaId,
    buffer,
    ext: 'mp4',
    name: 'snapnext-memory-reel.mp4',
    mime: 'video/mp4',
  });
}

async function currentDeletionWindow({ db, userId, artifact }) {
  return mediaDeletionGenerationIsCurrent({
    db,
    userId,
    generation: artifact.mediaDeletionGeneration,
  });
}

function buildLibraryMediaDocument({ user, artifact, stored, scope, mediaId, documentId, now }) {
  const sources = sourceMediaIds(artifact);
  const durationMs = totalDurationMs(artifact);
  const aspectRatio = String(artifact.canonicalManifest?.aspectRatio || '9:16');
  const contentHash = canonicalReelLogicalContentHash(artifact);
  const sourceCount = sources.length;
  return {
    _id: documentId,
    id: mediaId,
    userId: user.id,
    householdId: scope.householdId || null,
    name: 'SnapNext Memory Reel.mp4',
    size: Number(artifact.outputBytes),
    contentHash,
    mime: 'video/mp4',
    kind: 'video',
    durationMs,
    aspectRatio,
    storageKey: stored.storageKey,
    provider: stored.provider,
    favorite: false,
    trashed: false,
    sourceMediaIds: sources,
    creativeOrigin: {
      type: CREATE_REEL_LIBRARY_ORIGIN,
      version: CREATE_REEL_LIBRARY_VERSION,
      renderArtifactId: artifact.id,
      manifestHash: artifact.manifestHash,
      rendererOutputVersion: Number(artifact.rendererOutputVersion || artifact.canonicalManifest?.rendererOutputVersion || 1),
      aspectRatio,
      durationMs,
      sourceMediaIds: sources,
      createdAt: artifact.readyAt || now,
    },
    aiAnalysis: {
      caption: `Memory Reel created in SnapNext from ${sourceCount} saved ${sourceCount === 1 ? 'memory' : 'memories'}.`,
      description: 'A finished Memory Reel created from media already saved in your private SnapNext Library.',
      tags: ['snapnext-reel', 'created-memory', 'video'],
      autoAlbum: 'Created in SnapNext',
      contentType: 'Memory Reel',
    },
    aiAnalysisStatus: 'derived_local',
    aiAnalysisCached: true,
    aiAnalysisCompletedAt: now,
    createdAt: now,
    uploadedAt: now,
  };
}

async function storageSnapshot({ db, user, plan }) {
  const scope = await resolveStorageScope({ db, user, plan });
  const usage = await getStorageScopeUsage({ db, scope });
  return { scope, usage };
}

function ensureStorageAvailable({ plan, scope, usage, outputBytes }) {
  if (plan?.id === 'super_user') return;
  const limit = Number(scope?.storageBytes || 0);
  if (!Number.isFinite(limit) || limit <= 0 || usage.bytes + outputBytes > limit) {
    throw new CreateReelLibraryError(
      scope?.type === 'family' ? 'The shared Family storage is full.' : 'There is not enough plan storage to save this Reel.',
      409,
      'reel_library_storage_full',
    );
  }
}

export async function publishCanonicalReelToLibrary({ db, user, plan, artifact }) {
  if (!db || !user?.id || !artifact) {
    throw new CreateReelLibraryError('Reel save context is incomplete.', 400, 'reel_library_context_missing');
  }
  if (artifact.userId !== user.id || artifact.status !== 'ready') {
    throw new CreateReelLibraryError('This Reel is not ready to save.', 409, 'reel_library_artifact_not_ready');
  }
  if (!canonicalRenderAccountingComplete(artifact)) {
    throw new CreateReelLibraryError('Reel usage accounting is still being verified.', 409, 'reel_library_accounting_pending');
  }

  const outputBytes = Number(artifact.outputBytes || 0);
  if (!Number.isFinite(outputBytes) || outputBytes < 10_000 || outputBytes > MAX_LIBRARY_REEL_BYTES) {
    throw new CreateReelLibraryError('Rendered Reel size is outside the supported save range.', 409, 'reel_library_output_size_invalid');
  }
  if (!artifact.storageKey) {
    throw new CreateReelLibraryError('Rendered Reel storage is unavailable.', 409, 'reel_library_output_missing');
  }

  const mediaId = canonicalReelLibraryMediaId(artifact);
  const documentId = canonicalReelLibraryDocumentId(user.id, artifact);
  const existing = await db.collection('media').findOne({ _id: documentId, userId: user.id });
  if (existing) {
    const snapshot = await storageSnapshot({ db, user, plan });
    return {
      ok: true,
      alreadySaved: true,
      media: cleanMedia(existing),
      storageScope: snapshot.scope.type,
      remainingBytes: plan?.id === 'super_user' ? null : Math.max(0, Number(snapshot.scope.storageBytes || 0) - snapshot.usage.bytes),
    };
  }

  const generation = await currentDeletionWindow({ db, userId: user.id, artifact });
  if (!generation.current) {
    throw new CreateReelLibraryError('This Reel cannot be saved while source deletion is active.', 409, 'reel_library_deletion_window_stale');
  }

  const snapshot = await storageSnapshot({ db, user, plan });
  ensureStorageAvailable({ plan, scope: snapshot.scope, usage: snapshot.usage, outputBytes });

  let sourceVerification;
  try {
    sourceVerification = await storage.verify({
      provider: artifact.provider || 's3',
      storageKey: artifact.storageKey,
      expectedSize: outputBytes,
    });
  } catch (error) {
    throw new CreateReelLibraryError(error?.message || 'Rendered Reel could not be verified.', 503, 'reel_library_source_verification_failed');
  }

  let stored;
  try {
    stored = await copyCanonicalRenderOutput({
      userId: user.id,
      mediaId,
      artifact,
      expectedSize: outputBytes,
      sourceVerification,
    });
  } catch (error) {
    if (error instanceof CreateReelLibraryError) throw error;
    throw new CreateReelLibraryError(error?.message || 'Rendered Reel could not be copied into your Library.', 503, 'reel_library_copy_failed');
  }

  const cleanupCopy = async () => {
    if (!stored?.storageKey) return;
    await deleteStoredMediaVerified({ provider: stored.provider || artifact.provider || 's3', storageKey: stored.storageKey });
  };

  const postCopyGeneration = await currentDeletionWindow({ db, userId: user.id, artifact });
  if (!postCopyGeneration.current) {
    await cleanupCopy().catch(() => null);
    throw new CreateReelLibraryError('Source deletion started before the Reel could be saved.', 409, 'reel_library_deletion_window_stale');
  }

  const now = new Date();
  const mediaDoc = buildLibraryMediaDocument({
    user,
    artifact,
    stored,
    scope: snapshot.scope,
    mediaId,
    documentId,
    now,
  });

  try {
    await db.collection('media').updateOne(
      { _id: documentId, userId: user.id },
      { $setOnInsert: mediaDoc },
      { upsert: true },
    );
  } catch (error) {
    await cleanupCopy().catch(() => null);
    throw new CreateReelLibraryError(error?.message || 'Saved Reel could not be registered in your Library.', 503, 'reel_library_database_failed');
  }

  const finalGeneration = await currentDeletionWindow({ db, userId: user.id, artifact });
  if (!finalGeneration.current) {
    await db.collection('media').deleteOne({ _id: documentId, userId: user.id, 'creativeOrigin.renderArtifactId': artifact.id }).catch(() => null);
    await cleanupCopy().catch(() => null);
    throw new CreateReelLibraryError('Source deletion started before the Reel save completed.', 409, 'reel_library_deletion_window_stale');
  }

  const saved = await db.collection('media').findOne({ _id: documentId, userId: user.id });
  if (!saved) {
    await cleanupCopy().catch(() => null);
    throw new CreateReelLibraryError('Saved Reel could not be confirmed in your Library.', 503, 'reel_library_confirmation_failed');
  }

  await db.collection('render_artifacts').updateOne(
    { _id: artifact._id, userId: user.id, id: artifact.id, status: 'ready' },
    { $set: { libraryMediaId: mediaId, librarySavedAt: saved.createdAt || now, updatedAt: new Date() } },
  ).catch(() => null);

  const afterSave = await storageSnapshot({ db, user, plan });
  return {
    ok: true,
    alreadySaved: false,
    media: cleanMedia(saved),
    storageScope: afterSave.scope.type,
    remainingBytes: plan?.id === 'super_user' ? null : Math.max(0, Number(afterSave.scope.storageBytes || 0) - afterSave.usage.bytes),
  };
}
