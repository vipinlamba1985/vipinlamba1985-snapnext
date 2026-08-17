import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import {
  failCanonicalRender,
  prepareCanonicalRender,
} from '@/lib/create-render-artifacts.server';
import {
  canonicalRenderAccountingComplete,
  repairCanonicalRenderAccounting,
} from '@/lib/create-render-accounting.server';
import { validateCanonicalCreateManifest } from '@/lib/create-render-contract';
import {
  canonicalRenderCallbackUrl,
  canonicalRenderProviderStatus,
  estimateCanonicalRenderCostUsd,
  validateCanonicalRenderExecution,
} from '@/lib/create-render-execution.server';
import {
  canonicalRenderJobNeedsRecovery,
  dispatchCanonicalRenderJob,
  ensureCanonicalRenderJob,
  markCanonicalRenderJobFailed,
  safeCanonicalRenderJob,
} from '@/lib/create-render-jobs.server';

export const runtime = 'nodejs';
export const maxDuration = 15;

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function statusForPrepareFailure(result = {}) {
  if (result.layer === 'render_quota') return 429;
  if (result.layer === 'company_profit_guard') return 503;
  if (result.reason === 'media_deletion_in_progress') return 409;
  if (result.reason === 'render_artifact_cleanup_required') return 409;
  if (result.reason === 'render_source_verification_failed') return 409;
  if (String(result.reason || '').startsWith('create_manifest_')) return 400;
  return 409;
}

function safeArtifact(artifact = null) {
  if (!artifact) return null;
  return {
    id: artifact.id,
    manifestHash: artifact.manifestHash,
    status: artifact.status,
    outputBytes: Number(artifact.outputBytes || 0) || null,
    createdAt: artifact.createdAt || null,
    readyAt: artifact.readyAt || null,
  };
}

async function readyPayload({ artifact, job = null }) {
  if (!canonicalRenderAccountingComplete(artifact)) {
    const error = new Error('Canonical Reel accounting must finish before download.');
    error.code = 'render_accounting_incomplete';
    throw error;
  }
  const downloadUrl = await storage.getReadUrl({
    provider: artifact.provider || 's3',
    storageKey: artifact.storageKey,
    expiresSec: 15 * 60,
    filename: 'snapnext-reel.mp4',
    contentType: 'video/mp4',
  });
  return {
    cached: true,
    artifact: safeArtifact(artifact),
    job: safeCanonicalRenderJob(job),
    downloadUrl,
    contentType: 'video/mp4',
    deletionNotice: 'Copies saved or shared outside SnapNext are controlled by the destination and cannot be deleted by SnapNext.',
  };
}

async function repairReadyArtifact({ db, userId, artifact }) {
  if (!artifact || artifact.status !== 'ready') return { ok: false, reason: 'render_artifact_not_ready' };
  if (canonicalRenderAccountingComplete(artifact)) return { ok: true, artifact };
  try {
    return await repairCanonicalRenderAccounting({ db, userId, artifact });
  } catch (error) {
    return { ok: false, reason: error?.code || 'render_accounting_repair_failed' };
  }
}

async function prepareAttempt({ db, user, manifest, estimatedRenderCostUsd, output }) {
  return prepareCanonicalRender({
    db,
    user,
    manifest,
    estimatedRenderCostUsd,
    renderer: 'canonical-worker-v1',
    metadata: {
      requestSurface: 'create_reel_export',
      output,
    },
  });
}

async function recoverStalledAttempt({
  db,
  user,
  prepared,
  job,
  manifest,
  estimatedRenderCostUsd,
  output,
}) {
  const recovery = canonicalRenderJobNeedsRecovery(job);
  if (!prepared.inFlight || !recovery.recover) return { prepared, job, recovered: false };

  try {
    await failCanonicalRender({
      db,
      userId: user.id,
      artifactId: prepared.artifact._id,
      error: Object.assign(new Error('Canonical renderer attempt exceeded its bounded execution window.'), {
        code: recovery.reason || 'render_job_recovery_required',
      }),
    });
  } catch (error) {
    return {
      error: json({
        error: 'The previous Reel attempt could not be cleaned up safely. Please retry.',
        code: error?.code || 'render_recovery_cleanup_failed',
      }, 503),
    };
  }

  await markCanonicalRenderJobFailed({
    db,
    job,
    code: recovery.reason || 'render_job_recovery_required',
    message: 'The previous render attempt was closed before its quota and cost reservations could expire.',
  });

  const nextPrepared = await prepareAttempt({
    db,
    user,
    manifest,
    estimatedRenderCostUsd,
    output,
  });
  if (!nextPrepared.allowed) return { prepared: nextPrepared, job: null, recovered: true };
  if (nextPrepared.cacheHit && nextPrepared.artifact?.status === 'ready') {
    return { prepared: nextPrepared, job: null, recovered: true };
  }
  const nextJob = await ensureCanonicalRenderJob({ db, userId: user.id, artifact: nextPrepared.artifact });
  return { prepared: nextPrepared, job: nextJob, recovered: true };
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const manifestValidation = validateCanonicalCreateManifest(body.manifest || {});
  if (!manifestValidation.ok) {
    return json({ error: 'This Reel is not ready for canonical export.', code: manifestValidation.code }, 400);
  }

  const execution = validateCanonicalRenderExecution(manifestValidation.canonical);
  if (!execution.ok) {
    return json({ error: 'This Reel exceeds the current canonical export contract.', code: execution.reason }, 400);
  }
  const estimatedRenderCostUsd = estimateCanonicalRenderCostUsd(manifestValidation.canonical);
  if (!estimatedRenderCostUsd) {
    return json({ error: 'Render cost could not be bounded safely.', code: 'render_cost_estimate_unavailable' }, 503);
  }

  const db = await getDb();
  let prepared = await prepareAttempt({
    db,
    user,
    manifest: manifestValidation.canonical,
    estimatedRenderCostUsd,
    output: execution.output,
  });

  if (!prepared.allowed) {
    return json({
      error: 'Canonical Reel export cannot start right now.',
      code: prepared.reason,
      layer: prepared.layer || null,
      quota: prepared.quota || null,
    }, statusForPrepareFailure(prepared));
  }

  if (prepared.cacheHit && prepared.artifact?.status === 'ready') {
    const repaired = await repairReadyArtifact({ db, userId: user.id, artifact: prepared.artifact });
    if (!repaired.ok) {
      return json({
        error: 'This Reel is ready but its usage accounting is still being verified. Please retry.',
        code: repaired.reason || 'render_accounting_incomplete',
      }, repaired.stale ? 409 : 503);
    }
    return json(await readyPayload({ artifact: repaired.artifact }), 200);
  }

  let artifact = prepared.artifact;
  let job = await ensureCanonicalRenderJob({ db, userId: user.id, artifact });
  const recovered = await recoverStalledAttempt({
    db,
    user,
    prepared,
    job,
    manifest: manifestValidation.canonical,
    estimatedRenderCostUsd,
    output: execution.output,
  });
  if (recovered.error) return recovered.error;
  prepared = recovered.prepared;
  job = recovered.recovered ? recovered.job : job;

  if (!prepared.allowed) {
    return json({
      error: 'Canonical Reel export cannot restart right now.',
      code: prepared.reason,
      layer: prepared.layer || null,
      quota: prepared.quota || null,
    }, statusForPrepareFailure(prepared));
  }
  if (prepared.cacheHit && prepared.artifact?.status === 'ready') {
    const repaired = await repairReadyArtifact({ db, userId: user.id, artifact: prepared.artifact });
    if (!repaired.ok) {
      return json({
        error: 'This Reel is ready but its usage accounting is still being verified. Please retry.',
        code: repaired.reason || 'render_accounting_incomplete',
      }, repaired.stale ? 409 : 503);
    }
    return json(await readyPayload({ artifact: repaired.artifact, job }), 200);
  }

  artifact = prepared.artifact;
  if (!job || job.id !== artifact.id) {
    job = await ensureCanonicalRenderJob({ db, userId: user.id, artifact });
  }

  const providerStatus = canonicalRenderProviderStatus();
  if (!providerStatus.ready) {
    if (!prepared.inFlight) {
      try {
        await failCanonicalRender({
          db,
          userId: user.id,
          artifactId: artifact._id,
          error: Object.assign(new Error('Canonical renderer is not configured.'), { code: 'render_provider_not_configured' }),
        });
      } catch (error) {
        return json({
          error: 'Canonical renderer is unavailable and the pending attempt could not be cleaned up safely.',
          code: error?.code || 'render_provider_cleanup_failed',
        }, 503);
      }
      await markCanonicalRenderJobFailed({
        db,
        job,
        code: 'render_provider_not_configured',
        message: 'Canonical renderer is not configured.',
      });
      return json({
        error: 'Canonical Reel export is being activated. No export allowance was used.',
        code: 'render_provider_not_configured',
      }, 503);
    }
    return json({
      cached: false,
      artifact: safeArtifact(artifact),
      job: safeCanonicalRenderJob(job),
      rendererAvailable: false,
    }, 202);
  }

  if (artifact.status === 'pending_validation' || job.status === 'validating') {
    return json({ cached: false, artifact: safeArtifact(artifact), job: safeCanonicalRenderJob(job) }, 202);
  }

  const callbackUrl = canonicalRenderCallbackUrl();
  const dispatched = await dispatchCanonicalRenderJob({
    db,
    userId: user.id,
    job,
    artifact,
    callbackUrl,
  });

  if (dispatched.permanent) {
    return json({
      error: 'Canonical renderer rejected this Reel.',
      code: dispatched.reason,
      artifact: safeArtifact(artifact),
      job: safeCanonicalRenderJob(dispatched.job),
    }, 502);
  }

  return json({
    cached: false,
    artifact: safeArtifact(artifact),
    job: safeCanonicalRenderJob(dispatched.job || job),
    dispatchAccepted: dispatched.accepted === true,
    retryable: dispatched.retryable === true,
    recoveredPreviousAttempt: recovered.recovered === true,
    includedWithPlan: true,
  }, 202);
}
