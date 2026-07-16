import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { nextJobState, publicSmartSyncJob } from '@/lib/smart-sync/jobs';

export const runtime = 'nodejs';

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
  if (id) {
    const job = await db.collection('smart_sync_jobs').findOne({ id, userId: user.id });
    return job ? json({ job: publicSmartSyncJob(job) }) : json({ error: 'Sync job not found.' }, 404);
  }
  const jobs = await db.collection('smart_sync_jobs').find({ userId: user.id }).sort({ createdAt: -1 }).limit(25).toArray();
  return json({ jobs: jobs.map(publicSmartSyncJob) });
}

export async function POST(request, routeContext) {
  const ctx = await context(request, routeContext); if (ctx.error) return ctx.error;
  const { user, db, action } = ctx;
  const [id, command] = action;
  const body = await request.json().catch(() => ({}));

  if (!id) {
    const profile = await db.collection('smart_sync_profiles').findOne({ userId: user.id });
    if (!profile?.providerId) return json({ error: 'Save a Smart Sync source and plan first.' }, 400);
    const existing = await db.collection('smart_sync_jobs').findOne({ userId: user.id, providerId: profile.providerId, status: { $in: ['queued', 'running', 'paused'] } });
    if (existing) return json({ job: publicSmartSyncJob(existing), existing: true });
    const now = new Date();
    const job = {
      id: uuidv4(), userId: user.id, providerId: profile.providerId, rules: profile.rules || [], status: 'queued',
      estimatedItems: Math.max(0, Number(body.estimatedItems) || 0), estimatedBytes: Math.max(0, Number(body.estimatedBytes) || 0),
      processedItems: 0, importedItems: 0, skippedItems: 0, failedItems: 0, processedBytes: 0,
      cursor: null, lastError: null, retryCount: 0, pauseRequested: false, stopRequested: false,
      createdAt: now, updatedAt: now, startedAt: null, completedAt: null,
    };
    await db.collection('smart_sync_jobs').insertOne(job);
    return json({ job: publicSmartSyncJob(job) }, 201);
  }

  const job = await db.collection('smart_sync_jobs').findOne({ id, userId: user.id });
  if (!job) return json({ error: 'Sync job not found.' }, 404);
  const patch = nextJobState(job, command);
  if (!patch) return json({ error: 'That action is not available for this sync job.' }, 400);
  await db.collection('smart_sync_jobs').updateOne({ id, userId: user.id }, { $set: patch });
  return json({ job: publicSmartSyncJob({ ...job, ...patch }) });
}
