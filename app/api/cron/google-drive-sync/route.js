import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureGoogleDriveAutomaticJob, processGoogleDriveJobBatch } from '@/lib/smart-sync/google-drive-worker';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_CONNECTIONS_PER_RUN = 20;
const MAX_JOBS_PER_RUN = 20;

function json(data, status = 200) { return NextResponse.json(data, { status }); }

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = await getDb();
  const connections = await db.collection('cloud_connections')
    .find({ provider: 'google_drive', autoSyncEnabled: true })
    .limit(MAX_CONNECTIONS_PER_RUN)
    .toArray();

  const summary = { connections: connections.length, jobsPrepared: 0, jobsProcessed: 0, completed: 0, failed: 0, capacityReached: 0 };

  for (const connection of connections) {
    try {
      const job = await ensureGoogleDriveAutomaticJob({ db, connection });
      if (job) summary.jobsPrepared += 1;
    } catch (error) {
      summary.failed += 1;
      await db.collection('cloud_connections').updateOne(
        { _id: connection._id },
        { $set: { lastAutoSyncAt: new Date(), lastAutoSyncError: error?.message || 'Sync preparation failed', updatedAt: new Date() } },
      );
    }
  }

  const jobs = await db.collection('smart_sync_jobs')
    .find({ providerId: 'google_drive', status: { $in: ['queued', 'running'] } })
    .sort({ createdAt: 1 })
    .limit(MAX_JOBS_PER_RUN)
    .toArray();

  for (const job of jobs) {
    const result = await processGoogleDriveJobBatch({ db, jobId: job.id });
    if (!result.claimed) continue;
    summary.jobsProcessed += 1;
    if (result.completed) summary.completed += 1;
    if (result.failed) summary.failed += 1;
    if (result.capacityReached) summary.capacityReached += 1;
  }

  return json({ ok: true, ...summary });
}
