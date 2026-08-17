import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { storage } from '@/lib/storage';
import {
  failCanonicalRender,
  finalizeCanonicalRender,
  markCanonicalRenderPendingValidation,
} from '@/lib/create-render-artifacts.server';
import {
  renderCallbackSecretMatches,
  validateCanonicalRenderProbe,
} from '@/lib/create-render-execution.server';
import {
  markCanonicalRenderJobFailed,
  markCanonicalRenderJobProgress,
  markCanonicalRenderJobReady,
  markCanonicalRenderJobValidating,
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

export async function POST(request) {
  if (!renderCallbackSecretMatches(bearerToken(request))) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const jobId = String(body.jobId || '').trim();
  if (!jobId) return json({ error: 'jobId is required.' }, 400);

  const db = await getDb();
  const job = await db.collection('render_jobs').findOne({ id: jobId });
  if (!job) return json({ error: 'Render job not found.' }, 404);
  const artifact = await db.collection('render_artifacts').findOne({
    _id: job.artifactDocumentId,
    userId: job.userId,
  });
  if (!artifact || artifact.id !== job.id) return json({ error: 'Render artifact no longer matches this job.' }, 409);

  const status = String(body.status || '').toLowerCase();
  if (status === 'progress' || status === 'rendering') {
    const updated = await markCanonicalRenderJobProgress({ db, job, progress: body.progress });
    return json({ ok: true, job: safeCanonicalRenderJob(updated || job) });
  }

  if (status === 'failed') {
    const failure = cleanFailure(body);
    await failCanonicalRender({
      db,
      userId: job.userId,
      artifactId: job.artifactDocumentId,
      error: Object.assign(new Error(failure.message), { code: failure.code }),
    });
    const failed = await markCanonicalRenderJobFailed({ db, job, ...failure });
    return json({ ok: true, job: safeCanonicalRenderJob(failed) });
  }

  if (status !== 'completed') {
    return json({ error: 'Unsupported renderer callback status.' }, 400);
  }

  if (artifact.status === 'ready') {
    const ready = await markCanonicalRenderJobReady({ db, job });
    return json({ ok: true, idempotent: true, job: safeCanonicalRenderJob(ready) });
  }

  const outputBytes = Number(body.outputBytes ?? body.output?.bytes);
  const probeValidation = validateCanonicalRenderProbe({
    manifest: artifact.canonicalManifest,
    probe: body.probe || body.output?.probe || {},
    outputBytes,
  });
  if (!probeValidation.ok) {
    await failCanonicalRender({
      db,
      userId: job.userId,
      artifactId: job.artifactDocumentId,
      error: Object.assign(new Error(`Renderer output validation failed: ${probeValidation.reason}`), { code: probeValidation.reason }),
    });
    const failed = await markCanonicalRenderJobFailed({
      db,
      job,
      code: probeValidation.reason,
      message: 'Renderer output did not satisfy the canonical MP4 contract.',
    });
    return json({ ok: false, code: probeValidation.reason, job: safeCanonicalRenderJob(failed) }, 422);
  }

  let stored;
  try {
    stored = await storage.verify({
      provider: artifact.provider || 's3',
      storageKey: artifact.storageKey,
      expectedSize: outputBytes,
    });
  } catch (error) {
    await failCanonicalRender({ db, userId: job.userId, artifactId: job.artifactDocumentId, error });
    const failed = await markCanonicalRenderJobFailed({
      db,
      job,
      code: 'render_output_storage_verification_failed',
      message: error?.message || 'Rendered MP4 could not be verified in SnapNext storage.',
    });
    return json({ ok: false, code: 'render_output_storage_verification_failed', job: safeCanonicalRenderJob(failed) }, 422);
  }

  if (String(stored.contentType || '').toLowerCase() !== 'video/mp4') {
    await failCanonicalRender({
      db,
      userId: job.userId,
      artifactId: job.artifactDocumentId,
      error: Object.assign(new Error('Stored renderer output is not video/mp4.'), { code: 'render_output_content_type_invalid' }),
    });
    const failed = await markCanonicalRenderJobFailed({
      db,
      job,
      code: 'render_output_content_type_invalid',
      message: 'Rendered output was not stored as video/mp4.',
    });
    return json({ ok: false, code: 'render_output_content_type_invalid', job: safeCanonicalRenderJob(failed) }, 422);
  }

  const validatingJob = await markCanonicalRenderJobValidating({ db, job, probe: probeValidation.normalized });
  const pending = await markCanonicalRenderPendingValidation({
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
      const ready = await markCanonicalRenderJobReady({ db, job: validatingJob || job });
      return json({ ok: true, idempotent: true, job: safeCanonicalRenderJob(ready) });
    }
    return json({ error: 'Render artifact is not eligible for validation.', code: 'render_artifact_not_rendering' }, 409);
  }

  const reportedCost = body.actualRenderCostUsd ?? body.cost?.actualUsd;
  const parsedCost = reportedCost === undefined || reportedCost === null ? null : Number(reportedCost);
  if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0 || parsedCost > 100)) {
    await failCanonicalRender({
      db,
      userId: job.userId,
      artifactId: job.artifactDocumentId,
      error: Object.assign(new Error('Renderer reported an invalid actual cost.'), { code: 'render_actual_cost_invalid' }),
    });
    const failed = await markCanonicalRenderJobFailed({
      db,
      job: validatingJob || job,
      code: 'render_actual_cost_invalid',
      message: 'Renderer reported an invalid actual cost.',
    });
    return json({ ok: false, code: 'render_actual_cost_invalid', job: safeCanonicalRenderJob(failed) }, 422);
  }

  const finalized = await finalizeCanonicalRender({
    db,
    userId: job.userId,
    artifactId: job.artifactDocumentId,
    actualRenderCostUsd: parsedCost,
  });
  if (!finalized.ok) {
    const failed = await markCanonicalRenderJobFailed({
      db,
      job: validatingJob || job,
      code: finalized.reason || 'render_finalization_failed',
      message: finalized.stale ? 'Source media changed or was deleted before publication.' : 'Rendered MP4 could not be published.',
    });
    return json({ ok: false, code: finalized.reason, stale: finalized.stale === true, job: safeCanonicalRenderJob(failed) }, 409);
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
}
