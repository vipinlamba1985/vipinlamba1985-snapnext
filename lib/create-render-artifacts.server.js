import { v4 as uuidv4 } from 'uuid';
import {
  canonicalizeCreateManifest,
  createManifestHash,
  renderArtifactDocumentId,
  renderArtifactStorageKey,
  validateCanonicalCreateManifest,
} from './create-render-contract.js';
import {
  releaseCanonicalRenderQuota,
  reserveCanonicalRenderQuota,
  settleCanonicalRenderQuota,
} from './create-render-quota.js';
import {
  releaseProductSpendReservation,
  reserveProductSpend,
  settleProductSpend,
} from './product-spend-gate.js';
import {
  getMediaDeletionGenerationState,
  mediaDeletionGenerationIsCurrent,
} from './media-deletion-generation.server.js';
import { deleteStoredMediaVerified } from './storage-strict-delete.js';

const ACTIVE_RENDER_STATUSES = Object.freeze(['rendering', 'pending_validation']);
const INVALIDATABLE_RENDER_STATUSES = Object.freeze(['rendering', 'pending_validation', 'ready', 'deletion_failed']);

function mediaHash(doc = {}) {
  return String(doc.hash || doc.sha256 || doc.contentHash || '').trim().toLowerCase();
}

function sourceRefs(canonicalManifest = {}) {
  const refs = new Map();
  for (const scene of canonicalManifest.scenes || []) {
    const id = String(scene.sourceMediaId || '');
    const contentHash = String(scene.contentHash || '').toLowerCase();
    if (!id) continue;
    const existing = refs.get(id);
    if (existing && existing.contentHash !== contentHash) {
      const error = new Error('One media id was referenced with multiple content hashes.');
      error.code = 'create_manifest_source_hash_conflict';
      throw error;
    }
    refs.set(id, { mediaId: id, contentHash });
  }
  return [...refs.values()];
}

function artifactSources(artifact = {}) {
  return (artifact.sourceMediaIds || []).map(mediaId => ({
    mediaId,
    contentHash: artifact.sourceContentHashes?.[mediaId] || '',
  }));
}

export async function verifyCanonicalRenderSources({ db, userId, sources = [] }) {
  if (!db || !userId) throw new Error('Database and user id are required to verify render sources.');
  const expected = Array.isArray(sources) ? sources : [];
  if (!expected.length) return { ok: false, reason: 'render_sources_empty', missing: [], changed: [], trashed: [] };

  const ids = [...new Set(expected.map(row => String(row.mediaId || '')).filter(Boolean))];
  const docs = await db.collection('media').find({ userId, id: { $in: ids } }).toArray();
  const byId = new Map(docs.map(doc => [String(doc.id), doc]));
  const missing = [];
  const changed = [];
  const trashed = [];

  for (const source of expected) {
    const id = String(source.mediaId || '');
    const doc = byId.get(id);
    if (!doc) {
      missing.push(id);
      continue;
    }
    if (doc.trashed === true) trashed.push(id);
    if (!source.contentHash || mediaHash(doc) !== String(source.contentHash).toLowerCase()) changed.push(id);
  }

  return {
    ok: missing.length === 0 && changed.length === 0 && trashed.length === 0,
    missing,
    changed,
    trashed,
  };
}

async function renderReadWindowStillValid({ db, userId, generation }) {
  return mediaDeletionGenerationIsCurrent({ db, userId, generation });
}

export async function findCachedCanonicalRender({ db, userId, manifestHash }) {
  if (!db || !userId || !manifestHash) return null;
  const deletionState = await getMediaDeletionGenerationState({ db, userId });
  if (deletionState.inProgress) return null;

  const artifact = await db.collection('render_artifacts').findOne({
    _id: renderArtifactDocumentId(userId, manifestHash),
    userId,
    manifestHash,
    status: 'ready',
  });
  if (!artifact) return null;

  const [windowState, sourceVerification] = await Promise.all([
    renderReadWindowStillValid({ db, userId, generation: deletionState.generation }),
    verifyCanonicalRenderSources({ db, userId, sources: artifactSources(artifact) }),
  ]);
  return windowState.current && sourceVerification.ok ? artifact : null;
}

async function releaseArtifactReservations({ db, artifact, reason }) {
  await Promise.all([
    releaseCanonicalRenderQuota({ db, reservationId: artifact?.quotaReservationId, reason }),
    releaseProductSpendReservation({ db, reservationId: artifact?.costReservationId, reason }),
  ]);
}

async function deleteArtifactOutput({ artifact, deleteStored = deleteStoredMediaVerified }) {
  if (!artifact?.storageKey) return;
  await deleteStored({ provider: artifact.provider || 's3', storageKey: artifact.storageKey });
}

async function markArtifactStale({ db, artifact, reason, details = null, deleteStored = deleteStoredMediaVerified }) {
  try {
    await deleteArtifactOutput({ artifact, deleteStored });
  } catch (error) {
    await db.collection('render_artifacts').updateOne(
      { _id: artifact._id, status: { $in: INVALIDATABLE_RENDER_STATUSES } },
      {
        $set: {
          status: 'deletion_failed',
          deletionFailure: error?.message || String(error),
          staleReason: reason,
          updatedAt: new Date(),
        },
      },
    ).catch(() => null);
    const cleanupError = new Error('Derived render artifact could not be removed and verified.');
    cleanupError.code = 'derived_artifact_cleanup_failed';
    cleanupError.cause = error;
    throw cleanupError;
  }

  await db.collection('render_artifacts').updateOne(
    { _id: artifact._id, status: { $in: INVALIDATABLE_RENDER_STATUSES } },
    {
      $set: {
        status: 'stale_source',
        staleReason: reason,
        staleDetails: details,
        staleAt: new Date(),
        updatedAt: new Date(),
      },
      $unset: { deletionFailure: '' },
    },
  );
  await releaseArtifactReservations({ db, artifact, reason });
  return { ok: false, stale: true, reason };
}

async function releasePreparedReservations({ db, quotaReservationId, costReservationId, reason }) {
  await Promise.all([
    releaseCanonicalRenderQuota({ db, reservationId: quotaReservationId, reason }),
    releaseProductSpendReservation({ db, reservationId: costReservationId, reason }),
  ]);
}

export async function prepareCanonicalRender({
  db,
  user,
  manifest,
  estimatedRenderCostUsd,
  renderer = 'canonical-server',
  metadata = {},
}) {
  if (!db || !user?.id) return { allowed: false, reason: 'render_context_missing' };
  const validation = validateCanonicalCreateManifest(manifest);
  if (!validation.ok) return { allowed: false, reason: validation.code };
  const canonicalManifest = canonicalizeCreateManifest(validation.canonical);
  const manifestHash = createManifestHash(canonicalManifest);
  const artifactId = renderArtifactDocumentId(user.id, manifestHash);
  const sources = sourceRefs(canonicalManifest);

  const deletionState = await getMediaDeletionGenerationState({ db, userId: user.id });
  if (deletionState.inProgress) {
    return {
      allowed: false,
      reason: 'media_deletion_in_progress',
      mediaDeletionGeneration: deletionState.generation,
      manifestHash,
    };
  }

  const existing = await db.collection('render_artifacts').findOne({ _id: artifactId, userId: user.id });
  if (existing?.status === 'deletion_failed') {
    return {
      allowed: false,
      reason: 'render_artifact_cleanup_required',
      artifact: existing,
      manifestHash,
      canonicalManifest,
    };
  }
  if (existing?.status === 'ready') {
    const [windowState, sourceVerification] = await Promise.all([
      renderReadWindowStillValid({ db, userId: user.id, generation: deletionState.generation }),
      verifyCanonicalRenderSources({ db, userId: user.id, sources: artifactSources(existing) }),
    ]);
    if (!windowState.current) {
      return { allowed: false, reason: 'media_deletion_in_progress', manifestHash, canonicalManifest };
    }
    if (!sourceVerification.ok) {
      return { allowed: false, reason: 'render_source_verification_failed', sourceVerification, manifestHash, canonicalManifest };
    }
    return { allowed: true, cacheHit: true, artifact: existing, manifestHash, canonicalManifest };
  }
  if (existing && ACTIVE_RENDER_STATUSES.includes(existing.status)) {
    const windowState = await renderReadWindowStillValid({ db, userId: user.id, generation: deletionState.generation });
    if (!windowState.current) return { allowed: false, reason: 'media_deletion_in_progress', manifestHash, canonicalManifest };
    return { allowed: true, cacheHit: false, inFlight: true, artifact: existing, manifestHash, canonicalManifest };
  }

  const sourceVerification = await verifyCanonicalRenderSources({ db, userId: user.id, sources });
  if (!sourceVerification.ok) {
    return { allowed: false, reason: 'render_source_verification_failed', sourceVerification, manifestHash };
  }
  const preQuotaWindow = await renderReadWindowStillValid({ db, userId: user.id, generation: deletionState.generation });
  if (!preQuotaWindow.current) {
    return { allowed: false, reason: 'media_deletion_in_progress', manifestHash, canonicalManifest };
  }
  const mediaDeletionGeneration = deletionState.generation;

  const quota = await reserveCanonicalRenderQuota({
    db,
    userId: user.id,
    planId: user.plan || 'free',
    manifestHash,
  });
  if (!quota.allowed) return { allowed: false, reason: quota.reason, layer: 'render_quota', quota: quota.snapshot || null, manifestHash };

  const cost = await reserveProductSpend({
    db,
    feature: 'canonical_reel_render',
    userId: user.id,
    estimatedCostUsd: estimatedRenderCostUsd,
    metadata: { manifestHash, renderer, ...metadata },
  });
  if (!cost.allowed) {
    await releaseCanonicalRenderQuota({ db, reservationId: quota.reservationId, reason: `profit_guard_${cost.reason}` });
    return { allowed: false, reason: cost.reason, layer: 'company_profit_guard', profitGuard: cost.snapshot || null, manifestHash };
  }

  const preClaimWindow = await renderReadWindowStillValid({ db, userId: user.id, generation: mediaDeletionGeneration });
  if (!preClaimWindow.current) {
    await releasePreparedReservations({
      db,
      quotaReservationId: quota.reservationId,
      costReservationId: cost.reservationId,
      reason: 'media_deletion_started_before_render_claim',
    });
    return { allowed: false, reason: 'media_deletion_in_progress', manifestHash, canonicalManifest };
  }

  const now = new Date();
  const artifact = {
    _id: artifactId,
    id: uuidv4(),
    userId: user.id,
    manifestHash,
    manifestVersion: canonicalManifest.manifestVersion,
    renderContractVersion: canonicalManifest.renderContractVersion,
    rendererOutputVersion: canonicalManifest.rendererOutputVersion,
    canonicalManifest,
    sourceMediaIds: sources.map(row => row.mediaId),
    sourceContentHashes: Object.fromEntries(sources.map(row => [row.mediaId, row.contentHash])),
    mediaDeletionGeneration,
    renderer,
    provider: 's3',
    storageKey: renderArtifactStorageKey(user.id, manifestHash),
    status: 'rendering',
    quotaReservationId: quota.reservationId,
    costReservationId: cost.reservationId,
    estimatedRenderCostUsd: Number(estimatedRenderCostUsd),
    metadata,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    renderStartedAt: now,
  };

  let claimed = false;
  if (existing && ['failed', 'stale_source'].includes(existing.status)) {
    const result = await db.collection('render_artifacts').updateOne(
      { _id: artifactId, userId: user.id, status: existing.status },
      { $set: artifact, $unset: { lastError: '', staleReason: '', staleDetails: '', deletionFailure: '', readyAt: '' } },
    );
    claimed = result.matchedCount === 1;
  } else if (!existing) {
    try {
      await db.collection('render_artifacts').insertOne(artifact);
      claimed = true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  if (!claimed) {
    await releasePreparedReservations({
      db,
      quotaReservationId: quota.reservationId,
      costReservationId: cost.reservationId,
      reason: 'duplicate_manifest_claim',
    });
    const [winner, latestDeletionState] = await Promise.all([
      db.collection('render_artifacts').findOne({ _id: artifactId, userId: user.id }),
      getMediaDeletionGenerationState({ db, userId: user.id }),
    ]);
    if (latestDeletionState.inProgress) {
      return { allowed: false, reason: 'media_deletion_in_progress', manifestHash, canonicalManifest };
    }
    if (winner?.status === 'deletion_failed') {
      return { allowed: false, reason: 'render_artifact_cleanup_required', artifact: winner, manifestHash, canonicalManifest };
    }
    return {
      allowed: Boolean(winner),
      cacheHit: winner?.status === 'ready',
      inFlight: ACTIVE_RENDER_STATUSES.includes(winner?.status),
      reason: winner ? 'duplicate_manifest_reused' : 'render_claim_failed',
      artifact: winner,
      manifestHash,
      canonicalManifest,
    };
  }

  return {
    allowed: true,
    cacheHit: false,
    inFlight: false,
    artifact,
    manifestHash,
    canonicalManifest,
    quota: quota.snapshot || null,
    profitGuard: cost.snapshot || null,
  };
}

export async function markCanonicalRenderPendingValidation({
  db,
  userId,
  artifactId,
  provider = 's3',
  storageKey = null,
  outputBytes = null,
}) {
  const now = new Date();
  const result = await db.collection('render_artifacts').findOneAndUpdate(
    { _id: artifactId, userId, status: 'rendering' },
    {
      $set: {
        status: 'pending_validation',
        provider,
        ...(storageKey ? { storageKey } : {}),
        ...(Number.isFinite(Number(outputBytes)) ? { outputBytes: Number(outputBytes) } : {}),
        renderCompletedAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );
  return result?.value || result || null;
}

export async function finalizeCanonicalRender({
  db,
  userId,
  artifactId,
  actualRenderCostUsd = null,
  deleteStored = deleteStoredMediaVerified,
}) {
  const artifact = await db.collection('render_artifacts').findOne({ _id: artifactId, userId, status: 'pending_validation' });
  if (!artifact) return { ok: false, reason: 'render_artifact_not_pending_validation' };

  const sources = artifactSources(artifact);
  const [generation, sourceVerification] = await Promise.all([
    mediaDeletionGenerationIsCurrent({ db, userId, generation: artifact.mediaDeletionGeneration }),
    verifyCanonicalRenderSources({ db, userId, sources }),
  ]);
  if (!generation.current || !sourceVerification.ok) {
    return markArtifactStale({
      db,
      artifact,
      reason: !generation.current ? 'media_deletion_generation_moved' : 'render_source_verification_failed',
      details: { generation, sourceVerification },
      deleteStored,
    });
  }

  const readyAt = new Date();
  const ready = await db.collection('render_artifacts').updateOne(
    {
      _id: artifact._id,
      userId,
      status: 'pending_validation',
      mediaDeletionGeneration: artifact.mediaDeletionGeneration,
    },
    { $set: { status: 'ready', readyAt, updatedAt: readyAt } },
  );
  if (ready.matchedCount !== 1) {
    const latest = await db.collection('render_artifacts').findOne({ _id: artifact._id, userId });
    if (latest?.status === 'stale_source') return { ok: false, stale: true, reason: latest.staleReason || 'stale_source' };
    return markArtifactStale({ db, artifact, reason: 'render_publish_race_lost', deleteStored });
  }

  const finalGeneration = await mediaDeletionGenerationIsCurrent({ db, userId, generation: artifact.mediaDeletionGeneration });
  if (!finalGeneration.current) {
    const latest = await db.collection('render_artifacts').findOne({ _id: artifact._id, userId });
    return markArtifactStale({ db, artifact: latest || artifact, reason: 'media_deletion_generation_moved_after_publish', details: finalGeneration, deleteStored });
  }

  const actual = Number.isFinite(Number(actualRenderCostUsd))
    ? Math.max(0, Number(actualRenderCostUsd))
    : Math.max(0, Number(artifact.estimatedRenderCostUsd) || 0);
  await Promise.all([
    settleCanonicalRenderQuota({ db, reservationId: artifact.quotaReservationId, artifactId: artifact.id }),
    settleProductSpend({
      db,
      reservationId: artifact.costReservationId,
      feature: 'canonical_reel_render',
      userId,
      actualCostUsd: actual,
      provider: artifact.renderer,
      metadata: { manifestHash: artifact.manifestHash, artifactId: artifact.id },
    }),
  ]);

  await db.collection('render_artifacts').updateOne(
    { _id: artifact._id, userId, status: 'ready' },
    { $set: { quotaConsumedAt: new Date(), costSettledAt: new Date(), actualRenderCostUsd: actual, updatedAt: new Date() } },
  );
  const completed = await db.collection('render_artifacts').findOne({ _id: artifact._id, userId });
  return { ok: true, artifact: completed };
}

export async function failCanonicalRender({ db, userId, artifactId, error, deleteStored = deleteStoredMediaVerified }) {
  const artifact = await db.collection('render_artifacts').findOne({ _id: artifactId, userId });
  if (!artifact || !ACTIVE_RENDER_STATUSES.includes(artifact.status)) return { ok: false, reason: 'render_artifact_not_active' };

  try {
    await deleteArtifactOutput({ artifact, deleteStored });
  } catch (cleanupError) {
    await db.collection('render_artifacts').updateOne(
      { _id: artifact._id, userId },
      { $set: { status: 'deletion_failed', deletionFailure: cleanupError?.message || String(cleanupError), updatedAt: new Date() } },
    );
    throw cleanupError;
  }

  await db.collection('render_artifacts').updateOne(
    { _id: artifact._id, userId, status: { $in: ACTIVE_RENDER_STATUSES } },
    { $set: { status: 'failed', lastError: error?.message || String(error || 'render_failed'), failedAt: new Date(), updatedAt: new Date() } },
  );
  await releaseArtifactReservations({ db, artifact, reason: 'render_failed' });
  return { ok: false, reason: 'render_failed' };
}

export async function invalidateRenderArtifactsForSources({
  db,
  userId,
  sourceMediaIds = [],
  reason = 'source_media_deleted',
  deleteStored = deleteStoredMediaVerified,
}) {
  const ids = [...new Set(sourceMediaIds.map(String).filter(Boolean))];
  if (!ids.length) return { invalidated: 0, failures: [] };
  const artifacts = await db.collection('render_artifacts').find({
    userId,
    status: { $in: INVALIDATABLE_RENDER_STATUSES },
    sourceMediaIds: { $in: ids },
  }).toArray();

  const failures = [];
  let invalidated = 0;
  for (const artifact of artifacts) {
    try {
      await markArtifactStale({ db, artifact, reason, details: { sourceMediaIds: ids }, deleteStored });
      invalidated += 1;
    } catch (error) {
      failures.push({ artifactId: artifact.id || artifact._id, message: error?.message || String(error) });
    }
  }

  if (failures.length) {
    const error = new Error('One or more derived render artifacts could not be removed and verified.');
    error.code = 'derived_artifact_cleanup_failed';
    error.failures = failures;
    throw error;
  }
  return { invalidated, failures };
}

export async function deleteAllControlledRenderArtifactsForUser({
  db,
  userId,
  reason = 'account_deletion',
  deleteStored = deleteStoredMediaVerified,
}) {
  if (!db || !userId) throw new Error('Database and user id are required for render artifact cleanup.');
  const artifacts = await db.collection('render_artifacts').find({ userId }).toArray();
  const failures = [];
  let verifiedAbsent = 0;

  for (const artifact of artifacts) {
    try {
      await deleteArtifactOutput({ artifact, deleteStored });
      await releaseArtifactReservations({ db, artifact, reason });
      verifiedAbsent += 1;
    } catch (error) {
      failures.push({ artifactId: artifact.id || artifact._id, message: error?.message || String(error) });
    }
  }

  if (failures.length) {
    const error = new Error('One or more controlled render artifacts could not be removed and verified.');
    error.code = 'derived_artifact_cleanup_failed';
    error.failures = failures;
    throw error;
  }

  return { examined: artifacts.length, verifiedAbsent, failures };
}
