import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { processProviderJobBatch } from '@/lib/smart-sync/provider-job-worker';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_JOBS_PER_RUN = 20;
function json(data, status = 200) { return NextResponse.json(data, { status }); }

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);

  // Recovery only: never discover a cloud library and never create a job.
  const db = await getDb();
  const jobs = await db.collection('smart_sync_jobs')
    .find({ providerId: 'google_photos', mode: 'manual_selection', status: { $in: ['queued', 'running'] } })
    .sort({ createdAt: 1 })
    .limit(MAX_JOBS_PER_RUN)
    .toArray();

  const summary = { mode: 'smart_import_recovery', jobsFound: jobs.length, jobsProcessed: 0, completed: 0, failed: 0, capacityReached: 0 };
  for (const job of jobs) {
    const result = await processProviderJobBatch({ db, jobId: job.id });
    if (!result.claimed) continue;
    summary.jobsProcessed += 1;
    if (result.completed) summary.completed += 1;
    if (result.failed) summary.failed += 1;
    if (result.capacityReached) summary.capacityReached += 1;
  }
  return json({ ok: true, ...summary });
}
