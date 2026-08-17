import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { canonicalRenderAccountingComplete } from '@/lib/create-render-accounting.server';
import {
  canonicalRenderJobNeedsRecovery,
  getCanonicalRenderJob,
  safeCanonicalRenderJob,
} from '@/lib/create-render-jobs.server';
import { mediaDeletionGenerationIsCurrent } from '@/lib/media-deletion-generation.server';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function safeArtifact(artifact = null, releaseable = false) {
  if (!artifact) return null;
  const accountingComplete = canonicalRenderAccountingComplete(artifact);
  return {
    id: artifact.id,
    status: artifact.status === 'ready' && (!accountingComplete || !releaseable) ? 'validating' : artifact.status,
    outputBytes: Number(artifact.outputBytes || 0) || null,
    createdAt: artifact.createdAt || null,
    readyAt: releaseable ? artifact.readyAt || null : null,
  };
}

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const params = await context.params;
  const jobId = String(params?.jobId || '').trim();
  if (!jobId) return json({ error: 'Render job id is required.' }, 400);

  const db = await getDb();
  const job = await getCanonicalRenderJob({ db, userId: user.id, jobId });
  if (!job) return json({ error: 'Render job not found.' }, 404);
  const artifact = await db.collection('render_artifacts').findOne({
    _id: job.artifactDocumentId,
    userId: user.id,
  });
  if (!artifact) return json({ error: 'Render artifact not found.' }, 404);

  const accountingComplete = canonicalRenderAccountingComplete(artifact);
  const generation = accountingComplete
    ? await mediaDeletionGenerationIsCurrent({
      db,
      userId: user.id,
      generation: artifact.mediaDeletionGeneration,
    })
    : { current: false };
  const releaseable = accountingComplete && generation.current === true;

  let downloadUrl = null;
  if (releaseable) {
    downloadUrl = await storage.getReadUrl({
      provider: artifact.provider || 's3',
      storageKey: artifact.storageKey,
      expiresSec: 15 * 60,
      filename: 'snapnext-reel.mp4',
      contentType: 'video/mp4',
    });
  }

  const recovery = canonicalRenderJobNeedsRecovery(job);
  return json({
    artifact: safeArtifact(artifact, releaseable),
    job: safeCanonicalRenderJob(job),
    retryRecommended: artifact.status === 'rendering' && recovery.recover === true,
    retryReason: artifact.status === 'rendering' && recovery.recover ? recovery.reason : null,
    accountingPending: artifact.status === 'ready' && !accountingComplete,
    deletionSafetyPending: accountingComplete && !releaseable,
    downloadUrl,
    contentType: releaseable ? 'video/mp4' : null,
    deletionNotice: releaseable
      ? 'Copies saved or shared outside SnapNext are controlled by the destination and cannot be deleted by SnapNext.'
      : null,
  });
}
