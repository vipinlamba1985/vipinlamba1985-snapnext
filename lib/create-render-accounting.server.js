import { settleCanonicalRenderQuota } from './create-render-quota.js';
import { settleProductSpend } from './product-spend-gate.js';
import { mediaDeletionGenerationIsCurrent } from './media-deletion-generation.server.js';

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function canonicalRenderAccountingComplete(artifact = null) {
  if (!artifact || artifact.status !== 'ready') return false;
  return Boolean(artifact.quotaConsumedAt && artifact.costSettledAt);
}

export function canonicalRenderAccountingCost(artifact = null, actualRenderCostUsd = null) {
  return finiteNonNegative(actualRenderCostUsd)
    ?? finiteNonNegative(artifact?.pendingActualRenderCostUsd)
    ?? finiteNonNegative(artifact?.actualRenderCostUsd)
    ?? finiteNonNegative(artifact?.estimatedRenderCostUsd)
    ?? 0;
}

export async function rememberCanonicalRenderActualCost({ db, userId, artifactId, actualRenderCostUsd }) {
  const actual = finiteNonNegative(actualRenderCostUsd);
  if (!db || !userId || !artifactId || actual === null) return null;
  await db.collection('render_artifacts').updateOne(
    { _id: artifactId, userId, status: { $in: ['pending_validation', 'ready'] } },
    {
      $set: {
        pendingActualRenderCostUsd: actual,
        accountingStatus: 'pending',
        accountingUpdatedAt: new Date(),
      },
    },
  );
  return actual;
}

export async function repairCanonicalRenderAccounting({
  db,
  userId,
  artifact,
  actualRenderCostUsd = null,
}) {
  if (!db || !userId || !artifact?._id) return { ok: false, reason: 'render_accounting_context_missing' };
  if (artifact.status !== 'ready') return { ok: false, reason: 'render_artifact_not_ready' };
  if (canonicalRenderAccountingComplete(artifact)) return { ok: true, idempotent: true, artifact };

  const generation = await mediaDeletionGenerationIsCurrent({
    db,
    userId,
    generation: artifact.mediaDeletionGeneration,
  });
  if (!generation.current) {
    return { ok: false, stale: true, reason: 'media_deletion_generation_moved_before_accounting' };
  }

  const actual = canonicalRenderAccountingCost(artifact, actualRenderCostUsd);
  await rememberCanonicalRenderActualCost({
    db,
    userId,
    artifactId: artifact._id,
    actualRenderCostUsd: actual,
  });

  const quota = await settleCanonicalRenderQuota({
    db,
    reservationId: artifact.quotaReservationId,
    artifactId: artifact.id,
  });
  if (artifact.quotaReservationId && quota?.settled !== true) {
    const error = new Error('Successful Reel quota accounting is incomplete.');
    error.code = quota?.reason || 'render_quota_accounting_incomplete';
    throw error;
  }

  const cost = await settleProductSpend({
    db,
    reservationId: artifact.costReservationId,
    feature: 'canonical_reel_render',
    userId,
    actualCostUsd: actual,
    provider: artifact.renderer,
    metadata: { manifestHash: artifact.manifestHash, artifactId: artifact.id },
  });
  if (artifact.costReservationId && !cost) {
    const error = new Error('Successful Reel spend accounting is incomplete.');
    error.code = 'render_cost_accounting_incomplete';
    throw error;
  }

  const now = new Date();
  await db.collection('render_artifacts').updateOne(
    {
      _id: artifact._id,
      userId,
      status: 'ready',
      mediaDeletionGeneration: artifact.mediaDeletionGeneration,
    },
    {
      $set: {
        quotaConsumedAt: artifact.quotaConsumedAt || now,
        costSettledAt: artifact.costSettledAt || now,
        actualRenderCostUsd: actual,
        accountingStatus: 'settled',
        accountingUpdatedAt: now,
        updatedAt: now,
      },
      $unset: { pendingActualRenderCostUsd: '' },
    },
  );

  const completed = await db.collection('render_artifacts').findOne({ _id: artifact._id, userId });
  if (!canonicalRenderAccountingComplete(completed)) {
    const error = new Error('Successful Reel accounting could not be verified on the artifact.');
    error.code = 'render_accounting_verification_failed';
    throw error;
  }
  return { ok: true, artifact: completed, quota, cost };
}
