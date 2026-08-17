import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { storage } from '@/lib/storage';
import { deleteStoredMediaVerified } from '@/lib/storage-strict-delete';
import {
  failCanonicalRender,
  finalizeCanonicalRender,
  markCanonicalRenderPendingValidation,
  verifyCanonicalRenderSources,
} from '@/lib/create-render-artifacts.server';
import {
  canonicalRenderAccountingComplete,
  rememberCanonicalRenderActualCost,
  repairCanonicalRenderAccounting,
} from '@/lib/create-render-accounting.server';
import { mediaDeletionGenerationIsCurrent } from '@/lib/media-deletion-generation.server';
import {
  CANONICAL_REEL_MAX_OUTPUT_BYTES,
  CANONICAL_REEL_MULTIPART_PART_SIZE_BYTES,
  CANONICAL_REEL_MULTIPART_URL_TTL_SEC,
  renderCallbackSecretMatches,
  validateCanonicalRenderProbe,
} from '@/lib/create-render-execution.server';
import {
  abortCanonicalRenderMultipartUpload,
  completeCanonicalRenderMultipartUpload,
  createCanonicalRenderMultipartUpload,
  signCanonicalRenderMultipartParts,
} from '@/lib/create-render-multipart.server';
import {
  canonicalRenderJobDeadlineExpired,
  markCanonicalRenderJobFailed,
  markCanonicalRenderJobProgress,
  markCanonicalRenderJobReady,
  markCanonicalRenderJobUploading,
  markCanonicalRenderJobValidating,
  recordCanonicalRenderAttemptCost,
  safeCanonicalRenderJob,
} from '@/lib/create-render-jobs.server';

export const runtime = 'nodejs';
export const maxDuration = 15;

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function bearerToken(request) {
  const header = String(request.headers.get('authorization') || '');
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function cleanFailure(body = {}) {
  return {
    code: String(body.code || body.errorCode || 'render_provider_failed').slice(0, 200),
    message: String(body.error || body.message || 'Renderer reported a failure.').slice(0, 1000),
  };
}

function reportedCost(body = {}) {
  const raw = body.actualRenderCostUsd ?? body.cost?.actualUsd;
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return { ok: false, value: null };
  }
  return { ok: true, value };
}

function artifactSources(artifact = {}) {
  return (artifact.sourceMediaIds || []).map(mediaId => ({
    mediaId,
    contentHash: artifact.sourceContentHashes?.[mediaId] || '',
  }));
}

function outputSize(value) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 10_000 && bytes <= CANONICAL_REEL_MAX_OUTPUT_BYTES ? bytes : null;
}

function objectIsMissing(error) {
  const status = Number(error?.$metadata?.httpStatusCode || error?.statusCode || error?.status);
  return status === 404
    || error?.name === 'NotFound'
    || error?.name === 'NoSuchKey'
    || error?.Code === 'NoSuchKey'
    || error?.code === 'NoSuchKey';
}

async function activeSourceWindow({ db, artifact }) {
  const [generation, sources] = await Promise.all([
    mediaDeletionGenerationIsCurrent({
      db,
      userId: artifact.userId,
      generation: artifact.mediaDeletionGeneration,
    }),
    verifyCanonicalRenderSources({
      db,
      userId: artifact.userId,
      sources: artifactSources(artifact),
    }),
  ]);
  return { ok: generation.current && sources.ok, generation, sources };
}

async function strictCleanup(artifact) {
  return deleteStoredMediaVerified({
    provider: artifact.provider || 's3',
    storageKey: artifact.storageKey,
  });
}

async function failAttempt({
  db,
  job,
  artifact,
  code,
  message,
  actualRenderCostUsd = null,
}) {
  await recordCanonicalRenderAttemptCost({
    db,
    job,
    artifact,
    actualRenderCostUsd,
    outcome: code || 'render_failed',
  });
  await failCanonicalRender({
    db,
    userId: job.userId,
    artifactId: job.artifactDocumentId,
    error: Object.assign(new Error(message || code), { code }),
  });
  return markCanonicalRenderJobFailed({ db, job, code, message });
}

async function terminalArtifactResponse({ db, job, artifact, actualRenderCostUsd = null }) {
  if (artifact.status === 'ready') {
    if (!canonicalRenderAccountingComplete(artifact)) {
      const repaired = await repairCanonicalRenderAccounting({
        db,
        userId: job.userId,
        artifact,
        actualRenderCostUsd,
      });
      if (!repaired.ok) {
        return json({
          ok: false,
          stale: repaired.stale === true,
          code: repaired.reason || 'render_accounting_incomplete',
          job: safeCanonicalRenderJob(job),
        }, repaired.stale ? 409 : 503);
      }
      artifact = repaired.artifact;
    }
    const ready = await markCanonicalRenderJobReady({ db, job });
    return json({ ok: true, idempotent: true, job: safeCanonicalRenderJob(ready) });
  }
  if (['failed', 'stale_source', 'deletion_failed'].includes(artifact.status)) {
    try {
      await strictCleanup(artifact);
    } catch (error) {
      console.error('[create-render-callback] terminal cleanup failed', error?.code || error?.name, error?.message);
      return json({ error: 'Stale renderer output could not be removed safely.', code: 'render_stale_cleanup_failed' }, 503);
    }
    const failed = await markCanonicalRenderJobFailed({
      db,
      job,
      code: artifact.staleReason || artifact.status,
      message: 'This render attempt is no longer publishable.',
    });
    return json({ ok: false, stale: artifact.status === 'stale_source', job: safeCanonicalRenderJob(failed) }, 409);
  }
  return null;
}

async function handleUploadPlan({ db, job, artifact, body }) {
  if (artifact.status !== 'rendering') {
    const terminal = await terminalArtifactResponse({ db, job, artifact });
    return terminal || json({ error: 'Render is not eligible for upload planning.', code: 'render_not_uploadable' }, 409);
  }

  const bytes = outputSize(body.outputBytes ?? body.output?.bytes);
  if (!bytes) return json({ error: 'Rendered output size is outside the allowed range.', code: 'render_output_size_invalid' }, 422);
  if (artifact.outputExpectedBytes && Number(artifact.outputExpectedBytes) !== bytes) {
    return json({ error: 'Rendered output size changed after upload planning.', code: 'render_output_size_changed' }, 409);
  }

  const precheck = await activeSourceWindow({ db, artifact });
  if (!precheck.ok) {
    const failed = await failAttempt({
      db,
      job,
      artifact,
      code: precheck.generation.current ? 'render_source_verification_failed' : 'media_deletion_generation_moved',
      message: 'Source media changed or deletion started before output upload.',
    });
    return json({ ok: false, stale: true, job: safeCanonicalRenderJob(failed) }, 409);
  }

  let uploadId = artifact.outputMultipartUploadId || null;
  if (!uploadId) {
    const created = await createCanonicalRenderMultipartUpload({ storageKey: artifact.storageKey });
    uploadId = created.uploadId;
    const claimed = await db.collection('render_artifacts').updateOne(
      {
        _id: artifact._id,
        userId: artifact.userId,
        status: 'rendering',
        mediaDeletionGeneration: artifact.mediaDeletionGeneration,
        outputMultipartUploadId: { $exists: false },
      },
      {
        $set: {
          outputMultipartUploadId: uploadId,
          outputExpectedBytes: bytes,
          outputMultipartCreatedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
    if (claimed.matchedCount !== 1) {
      await abortCanonicalRenderMultipartUpload({ storageKey: artifact.storageKey, uploadId }).catch(() => null);
      const current = await db.collection('render_artifacts').findOne({ _id: artifact._id, userId: artifact.userId });
      if (!current || current.status !== 'rendering' || !current.outputMultipartUploadId || Number(current.outputExpectedBytes) !== bytes) {
        const terminal = current ? await terminalArtifactResponse({ db, job, artifact: current }) : null;
        return terminal || json({ error: 'Render upload lease was lost.', code: 'render_upload_lease_lost' }, 409);
      }
      uploadId = current.outputMultipartUploadId;
    }
  }

  const current = await db.collection('render_artifacts').findOne({ _id: artifact._id, userId: artifact.userId });
  const postcheck = current
    ? await activeSourceWindow({ db, artifact: current })
    : { ok: false, generation: { current: false }, sources: { ok: false } };
  if (!current || current.status !== 'rendering' || !postcheck.ok) {
    if (current) {
      const failed = await failAttempt({
        db,
        job,
        artifact: current,
        code: 'render_upload_lease_stale',
        message: 'Render upload became stale before publication.',
      });
      return json({ ok: false, stale: true, job: safeCanonicalRenderJob(failed) }, 409);
    }
    await abortCanonicalRenderMultipartUpload({ storageKey: artifact.storageKey, uploadId }).catch(() => null);
    return json({ error: 'Render upload lease was lost.', code: 'render_upload_lease_lost' }, 409);
  }

  const partCount = Math.ceil(bytes / CANONICAL_REEL_MULTIPART_PART_SIZE_BYTES);
  const parts = await signCanonicalRenderMultipartParts({
    storageKey: current.storageKey,
    uploadId,
    partCount,
    expiresSec: CANONICAL_REEL_MULTIPART_URL_TTL_SEC,
  });
  const uploading = await markCanonicalRenderJobUploading({ db, job, uploadId, outputBytes: bytes });
  return json({
    ok: true,
    job: safeCanonicalRenderJob(uploading || job),
    upload: {
      mode: 'multipart',
      uploadId,
      partSizeBytes: CANONICAL_REEL_MULTIPART_PART_SIZE_BYTES,
      outputBytes: bytes,
      parts,
    },
  });
}

export async function POST(request) {
  if (!renderCallbackSecretMatches(bearerToken(request))) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const jobId = String(body.jobId || '').trim();
    if (!jobId) return json({ error: 'jobId is required.' }, 400);

    const db = await getDb();
    const job = await db.collection('render_jobs').findOne({ id: jobId });
    if (!job) return json({ error: 'Render job not found.' }, 404);
    let artifact = await db.collection('render_artifacts').findOne({
      _id: job.artifactDocumentId,
      userId: job.userId,
    });
    if (!artifact || artifact.id !== job.id) return json({ error: 'Render artifact no longer matches this job.' }, 409);

    const cost = reportedCost(body);
    if (!cost.ok) {
      return json({ error: 'Renderer reported an invalid actual cost.', code: 'render_actual_cost_invalid' }, 422);
    }

    const status = String(body.status || '').toLowerCase();
    const terminal = await terminalArtifactResponse({
      db,
      job,
      artifact,
      actualRenderCostUsd: cost.value,
    });
    if (terminal) return terminal;

    if (canonicalRenderJobDeadlineExpired(job)) {
      const failed = await failAttempt({
        db,
        job,
        artifact,
        code: 'render_job_deadline_exceeded',
        message: 'Renderer callback arrived after the bounded execution deadline.',
        actualRenderCostUsd: cost.value,
      });
      return json({ ok: false, expired: true, code: 'render_job_deadline_exceeded', job: safeCanonicalRenderJob(failed) }, 410);
    }

    if (status === 'progress' || status === 'rendering') {
      if (artifact.status !== 'rendering') return json({ error: 'Render is no longer active.' }, 409);
      const updated = await markCanonicalRenderJobProgress({ db, job, progress: body.progress });
      return json({ ok: true, job: safeCanonicalRenderJob(updated || job) });
    }

    if (status === 'upload_plan') {
      return handleUploadPlan({ db, job, artifact, body });
    }

    if (status === 'failed') {
      const failure = cleanFailure(body);
      const failed = await failAttempt({
        db,
        job,
        artifact,
        ...failure,
        actualRenderCostUsd: cost.value,
      });
      return json({ ok: true, job: safeCanonicalRenderJob(failed) });
    }

    if (status !== 'completed') {
      return json({ error: 'Unsupported renderer callback status.' }, 400);
    }

    const outputBytes = outputSize(body.outputBytes ?? body.output?.bytes);
    if (!outputBytes || Number(artifact.outputExpectedBytes || 0) !== outputBytes || !artifact.outputMultipartUploadId) {
      const failed = await failAttempt({
        db,
        job,
        artifact,
        code: 'render_multipart_plan_missing',
        message: 'Renderer completed without a valid SnapNext multipart upload plan.',
        actualRenderCostUsd: cost.value,
      });
      return json({ ok: false, code: 'render_multipart_plan_missing', job: safeCanonicalRenderJob(failed) }, 422);
    }

    const probeValidation = validateCanonicalRenderProbe({
      manifest: artifact.canonicalManifest,
      probe: body.probe || body.output?.probe || {},
      outputBytes,
    });
    if (!probeValidation.ok) {
      const failed = await failAttempt({
        db,
        job,
        artifact,
        code: probeValidation.reason,
        message: 'Renderer output did not satisfy the canonical MP4 contract.',
        actualRenderCostUsd: cost.value,
      });
      return json({ ok: false, code: probeValidation.reason, job: safeCanonicalRenderJob(failed) }, 422);
    }

    const publicationWindow = await activeSourceWindow({ db, artifact });
    if (!publicationWindow.ok) {
      const failed = await failAttempt({
        db,
        job,
        artifact,
        code: publicationWindow.generation.current ? 'render_source_verification_failed' : 'media_deletion_generation_moved',
        message: 'Source media changed or deletion started before publication.',
        actualRenderCostUsd: cost.value,
      });
      return json({ ok: false, stale: true, job: safeCanonicalRenderJob(failed) }, 409);
    }

    let stored = null;
    try {
      stored = await storage.verify({
        provider: artifact.provider || 's3',
        storageKey: artifact.storageKey,
        expectedSize: outputBytes,
      });
    } catch (error) {
      if (!objectIsMissing(error)) {
        const failed = await failAttempt({
          db,
          job,
          artifact,
          code: 'render_output_storage_verification_failed',
          message: error?.message || 'Rendered MP4 could not be verified in SnapNext storage.',
          actualRenderCostUsd: cost.value,
        });
        return json({ ok: false, code: 'render_output_storage_verification_failed', job: safeCanonicalRenderJob(failed) }, 422);
      }
    }

    if (!stored) {
      try {
        await completeCanonicalRenderMultipartUpload({
          storageKey: artifact.storageKey,
          uploadId: artifact.outputMultipartUploadId,
          parts: body.parts || body.output?.parts || [],
        });
        stored = await storage.verify({
          provider: artifact.provider || 's3',
          storageKey: artifact.storageKey,
          expectedSize: outputBytes,
        });
      } catch (error) {
        artifact = await db.collection('render_artifacts').findOne({ _id: artifact._id, userId: artifact.userId }) || artifact;
        if (['stale_source', 'failed', 'deletion_failed'].includes(artifact.status)) {
          await recordCanonicalRenderAttemptCost({
            db,
            job,
            artifact,
            actualRenderCostUsd: cost.value,
            outcome: artifact.staleReason || artifact.status,
          });
          return terminalArtifactResponse({ db, job, artifact, actualRenderCostUsd: cost.value });
        }
        const failed = await failAttempt({
          db,
          job,
          artifact,
          code: error?.code || 'render_multipart_completion_failed',
          message: error?.message || 'Rendered MP4 multipart upload could not be completed.',
          actualRenderCostUsd: cost.value,
        });
        return json({ ok: false, code: error?.code || 'render_multipart_completion_failed', job: safeCanonicalRenderJob(failed) }, 422);
      }
    }

    if (String(stored.contentType || '').toLowerCase() !== 'video/mp4') {
      const failed = await failAttempt({
        db,
        job,
        artifact,
        code: 'render_output_content_type_invalid',
        message: 'Rendered output was not stored as video/mp4.',
        actualRenderCostUsd: cost.value,
      });
      return json({ ok: false, code: 'render_output_content_type_invalid', job: safeCanonicalRenderJob(failed) }, 422);
    }

    const validatingJob = await markCanonicalRenderJobValidating({ db, job, probe: probeValidation.normalized });
    let pending = await markCanonicalRenderPendingValidation({
      db,
      userId: job.userId,
      artifactId: job.artifactDocumentId,
      provider: artifact.provider || 's3',
      storageKey: artifact.storageKey,
      outputBytes,
    });
    if (!pending) {
      const current = await db.collection('render_artifacts').findOne({ _id: job.artifactDocumentId, userId: job.userId });
      if (current?.status === 'ready') {
        const repaired = await repairCanonicalRenderAccounting({
          db,
          userId: job.userId,
          artifact: current,
          actualRenderCostUsd: cost.value,
        });
        if (!repaired.ok) {
          return json({ ok: false, code: repaired.reason || 'render_accounting_incomplete' }, repaired.stale ? 409 : 503);
        }
        const ready = await markCanonicalRenderJobReady({ db, job: validatingJob || job });
        return json({ ok: true, idempotent: true, job: safeCanonicalRenderJob(ready) });
      }
      if (current?.status === 'pending_validation') {
        pending = current;
      } else {
        if (current) {
          await recordCanonicalRenderAttemptCost({
            db,
            job,
            artifact: current,
            actualRenderCostUsd: cost.value,
            outcome: current.staleReason || 'render_artifact_not_rendering',
          });
          await strictCleanup(current);
        }
        const failed = await markCanonicalRenderJobFailed({
          db,
          job: validatingJob || job,
          code: current?.staleReason || 'render_artifact_not_rendering',
          message: 'Render artifact became stale before validation.',
        });
        return json({ ok: false, stale: true, job: safeCanonicalRenderJob(failed) }, 409);
      }
    }

    await db.collection('render_artifacts').updateOne(
      { _id: pending._id, userId: job.userId, status: 'pending_validation' },
      { $unset: { outputMultipartUploadId: '', outputExpectedBytes: '', outputMultipartCreatedAt: '' } },
    );

    const accountingCost = cost.value ?? Number(pending.estimatedRenderCostUsd || 0);
    await rememberCanonicalRenderActualCost({
      db,
      userId: job.userId,
      artifactId: job.artifactDocumentId,
      actualRenderCostUsd: accountingCost,
    });

    const finalized = await finalizeCanonicalRender({
      db,
      userId: job.userId,
      artifactId: job.artifactDocumentId,
      actualRenderCostUsd: cost.value,
    });
    if (!finalized.ok) {
      await recordCanonicalRenderAttemptCost({
        db,
        job,
        artifact: pending,
        actualRenderCostUsd: cost.value,
        outcome: finalized.reason || 'render_finalization_failed',
      });
      const failed = await markCanonicalRenderJobFailed({
        db,
        job: validatingJob || job,
        code: finalized.reason || 'render_finalization_failed',
        message: finalized.stale ? 'Source media changed or was deleted before publication.' : 'Rendered MP4 could not be published.',
      });
      return json({ ok: false, code: finalized.reason, stale: finalized.stale === true, job: safeCanonicalRenderJob(failed) }, 409);
    }

    if (!canonicalRenderAccountingComplete(finalized.artifact)) {
      const repaired = await repairCanonicalRenderAccounting({
        db,
        userId: job.userId,
        artifact: finalized.artifact,
        actualRenderCostUsd: accountingCost,
      });
      if (!repaired.ok) {
        return json({ ok: false, code: repaired.reason || 'render_accounting_incomplete' }, repaired.stale ? 409 : 503);
      }
    }

    const ready = await markCanonicalRenderJobReady({ db, job: validatingJob || job });
    return json({
      ok: true,
      job: safeCanonicalRenderJob(ready),
      artifact: {
        id: finalized.artifact.id,
        status: finalized.artifact.status,
        manifestHash: finalized.artifact.manifestHash,
        outputBytes: finalized.artifact.outputBytes,
      },
    });
  } catch (error) {
    console.error('[create-render-callback] processing failed', error?.code || error?.name, error?.message);
    return json({
      error: 'Canonical render callback could not be processed safely. The worker should retry.',
      code: error?.code || 'render_callback_processing_failed',
    }, 503);
  }
}
