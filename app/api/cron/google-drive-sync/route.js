import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureGoogleDriveAutomaticJob, processGoogleDriveJobBatch } from '@/lib/smart-sync/google-drive-worker';
import { ensureProviderAutomaticJob, processProviderJobBatch } from '@/lib/smart-sync/provider-job-worker';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_CONNECTIONS_PER_RUN = 20;
const MAX_JOBS_PER_RUN = 20;
const AUTOMATIC_PROVIDERS = ['google_drive', 'dropbox', 'onedrive'];

function json(data, status = 200) { return NextResponse.json(data, { status }); }

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = await getDb();
  const connections = await db.collection('cloud_connections')
    .find({ provider: { $in: AUTOMATIC_PROVIDERS }, autoSyncEnabled: true })
    .limit(MAX_CONNECTIONS_PER_RUN)
    .toArray();

  const summary = {
    connections: connections.length,
    jobsPrepared: 0,
    jobsProcessed: 0,
    completed: 0,
    failed: 0,
    capacityReached: 0,
    providers: {},
  };

  for (const connection of connections) {
    summary.providers[connection.provider] = summary.providers[connection.provider] || { connections: 0, jobs: 0 };
    summary.providers[connection.provider].connections += 1;
    try {
      const job = connection.provider === 'google_drive'
        ? await ensureGoogleDriveAutomaticJob({ db, connection })
        : await ensureProviderAutomaticJob({ db, connection });
      if (job) {
        summary.jobsPrepared += 1;
        summary.providers[connection.provider].jobs += 1;
      }
    } catch (error) {
      summary.failed += 1;
      await db.collection('cloud_connections').updateOne(
        { _id: connection._id },
        { $set: { lastAutoSyncAt: new Date(), lastAutoSyncError: error?.message || 'Sync preparation failed', updatedAt: new Date() } },
      );
    }
  }

  const jobs = await db.collection('smart_sync_jobs')
    .find({ providerId: { $in: [...AUTOMATIC_PROVIDERS, 'google_photos'] }, status: { $in: ['queued', 'running'] } })
    .sort({ createdAt: 1 })
    .limit(MAX_JOBS_PER_RUN)
    .toArray();

  for (const job of jobs) {
    const result = job.providerId === 'google_drive'
      ? await processGoogleDriveJobBatch({ db, jobId: job.id })
      : await processProviderJobBatch({ db, jobId: job.id });
    if (!result.claimed) continue;
    summary.jobsProcessed += 1;
    if (result.completed) summary.completed += 1;
    if (result.failed) summary.failed += 1;
    if (result.capacityReached) summary.capacityReached += 1;
  }

  return json({ ok: true, ...summary });
}
