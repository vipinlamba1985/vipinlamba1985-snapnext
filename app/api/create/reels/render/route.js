import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import {
  failCanonicalRender,
  prepareCanonicalRender,
} from '@/lib/create-render-artifacts.server';
import { validateCanonicalCreateManifest } from '@/lib/create-render-contract';
import {
  canonicalRenderProviderStatus,
  estimateCanonicalRenderCostUsd,
  validateCanonicalRenderExecution,
} from '@/lib/create-render-execution.server';
import {
  dispatchCanonicalRenderJob,
  ensureCanonicalRenderJob,
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
  const prepared = await prepareCanonicalRender({
    db,
    user,
    manifest: manifestValidation.canonical,
    estimatedRenderCostUsd,
    renderer: 'canonical-worker-v1',
    metadata: {
      requestSurface: 'create_reel_export',
      output: execution.output,
    },
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
    return json(await readyPayload({ artifact: prepared.artifact }), 200);
  }

  const artifact = prepared.artifact;
  const job = await ensureCanonicalRenderJob({ db, userId: user.id, artifact });
  const providerStatus = canonicalRenderProviderStatus();

  if (!providerStatus.ready) {
    if (!prepared.inFlight) {
      await failCanonicalRender({
        db,
        userId: user.id,
        artifactId: artifact._id,
        error: Object.assign(new Error('Canonical renderer is not configured.'), { code: 'render_provider_not_configured' }),
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

  const callbackUrl = new URL('/api/internal/create-render/callback', request.url).toString();
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
    includedWithPlan: true,
  }, 202);
}
