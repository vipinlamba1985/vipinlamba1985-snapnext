import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { canTransition, normalizeCounts } from '@/lib/smart-sync/job-policy';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }
function publicJob(job) {
  if (!job) return null;
  const { _id, fileIds, ...safe } = job;
  return { ...safe, fileCount: fileIds?.length || job.total || 0 };
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const db = await getDb();
  const jobs = await db.collection('smart_sync_jobs').find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).toArray();
  return json({ jobs: jobs.map(publicJob) });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  const action = String(body.action || 'create');

  if (action === 'create') {
    const provider = String(body.provider || 'google_drive');
    const fileIds = [...new Set(Array.isArray(body.fileIds) ? body.fileIds.map(String) : [])].slice(0, 500);
    if (!fileIds.length) return json({ error: 'Choose at least one file.' }, 400);
    const now = new Date();
    const job = {
      id: uuidv4(), userId: user.id, provider, fileIds, total: fileIds.length,
      state: 'queued', counts: normalizeCounts({}, fileIds.length), currentIndex: 0,
      attempts: 0, error: null, createdAt: now, updatedAt: now, startedAt: null,
      completedAt: null, cancelledAt: null,
    };
    await db.collection('smart_sync_jobs').insertOne(job);
    return json({ job: publicJob(job) }, 201);
  }

  const jobId = String(body.jobId || '');
  const job = await db.collection('smart_sync_jobs').findOne({ id: jobId, userId: user.id });
  if (!job) return json({ error: 'Sync job not found.' }, 404);

  if (action === 'progress') {
    if (!['queued', 'running', 'paused'].includes(job.state)) return json({ error: 'This job can no longer be updated.' }, 409);
    const counts = normalizeCounts(body.counts, job.total);
    const nextState = counts.completed >= job.total ? 'completed' : body.state === 'paused' ? 'paused' : 'running';
    const now = new Date();
    await db.collection('smart_sync_jobs').updateOne({ id: job.id, userId: user.id }, { $set: {
      state: nextState, counts, currentIndex: counts.completed, updatedAt: now,
      startedAt: job.startedAt || now, completedAt: nextState === 'completed' ? now : null,
      error: body.error ? String(body.error).slice(0, 500) : null,
    } });
    return json({ ok: true, state: nextState, counts });
  }

  const target = action === 'pause' ? 'paused' : action === 'resume' || action === 'retry' ? 'queued' : action === 'cancel' ? 'cancelled' : '';
  if (!target) return json({ error: 'Unsupported job action.' }, 400);
  if (!canTransition(job.state, target)) return json({ error: `A ${job.state} job cannot move to ${target}.` }, 409);
  const now = new Date();
  const set = { state: target, updatedAt: now };
  if (target === 'cancelled') set.cancelledAt = now;
  if (action === 'retry') { set.attempts = (job.attempts || 0) + 1; set.error = null; }
  await db.collection('smart_sync_jobs').updateOne({ id: job.id, userId: user.id }, { $set: set });
  return json({ ok: true, state: target });
}
