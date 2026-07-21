import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { nextJobState, publicSmartSyncJob } from '@/lib/smart-sync/jobs';
import { processGoogleDriveJobBatch } from '@/lib/smart-sync/google-drive-worker';

export const runtime = 'nodejs';
export const maxDuration = 300;

function json(data, status = 200) { return NextResponse.json(data, { status }); }

async function context(request, routeContext) {
  const user = await getUserFromRequest(request);
  if (!user) return { error: json({ error: 'Please sign in again.' }, 401) };
  const db = await getDb();
  const action = (await routeContext.params).action || [];
  return { user, db, action };
}

export async function GET(request, routeContext) {
  const ctx = await context(request, routeContext); if (ctx.error) return ctx.error;
  const { user, db, action } = ctx;
  const [id] = action;
  if (!id) return json({ error: 'Sync job id is required.' }, 400);
  const job = await db.collection('smart_sync_jobs').findOne({ id, userId: user.id });
  return job ? json({ job: publicSmartSyncJob(job) }) : json({ error: 'Sync job not found.' }, 404);
}

export async function POST(request, routeContext) {
  const ctx = await context(request, routeContext); if (ctx.error) return ctx.error;
  const { user, db, action } = ctx;
  const [id, command] = action;
  if (!id || !command) return json({ error: 'Sync job action is required.' }, 400);

  const job = await db.collection('smart_sync_jobs').findOne({ id, userId: user.id });
  if (!job) return json({ error: 'Sync job not found.' }, 404);

  if (command === 'run') {
    if (job.providerId !== 'google_drive') return json({ error: 'This provider is prepared for the native app worker.' }, 409);
    const result = await processGoogleDriveJobBatch({ db, jobId: id, userId: user.id });
    const updated = await db.collection('smart_sync_jobs').findOne({ id, userId: user.id });
    return json({ result, job: publicSmartSyncJob(updated || job) });
  }

  const patch = nextJobState(job, command);
  if (!patch) return json({ error: 'That action is not available for this sync job.' }, 400);

  const update = { $set: patch };
  if (command === 'stop') update.$unset = { activeKey: '', leaseToken: '', leaseUntil: '' };
  if (command === 'retry') {
    const activeKey = `${user.id}:${job.providerId}`;
    const otherActive = await db.collection('smart_sync_jobs').findOne({ activeKey, id: { $ne: id } });
    if (otherActive) return json({ error: 'Another sync job is already active for this source.' }, 409);
    update.$set.activeKey = activeKey;
  }

  await db.collection('smart_sync_jobs').updateOne({ id, userId: user.id }, update);
  return json({ job: publicSmartSyncJob({ ...job, ...patch, ...(command === 'retry' ? { activeKey: `${user.id}:${job.providerId}` } : {}) }) });
}
