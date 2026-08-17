import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import {
  getCanonicalRenderJob,
  safeCanonicalRenderJob,
} from '@/lib/create-render-jobs.server';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
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
    failure: artifact.lastError || artifact.staleReason || artifact.deletionFailure || null,
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

  let downloadUrl = null;
  if (artifact.status === 'ready') {
    downloadUrl = await storage.getReadUrl({
      provider: artifact.provider || 's3',
      storageKey: artifact.storageKey,
      expiresSec: 15 * 60,
      filename: 'snapnext-reel.mp4',
      contentType: 'video/mp4',
    });
  }

  return json({
    artifact: safeArtifact(artifact),
    job: safeCanonicalRenderJob(job),
    downloadUrl,
    contentType: artifact.status === 'ready' ? 'video/mp4' : null,
    deletionNotice: artifact.status === 'ready'
      ? 'Copies saved or shared outside SnapNext are controlled by the destination and cannot be deleted by SnapNext.'
      : null,
  });
}
