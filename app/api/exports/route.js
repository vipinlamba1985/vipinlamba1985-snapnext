import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { effectivePlan } from '@/lib/entitlements';
import { cleanupExpiredExports, createJob, runExportJob } from '@/lib/exports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  cleanupExpiredExports().catch(() => {});
  const jobs = await db.collection('export_jobs')
    .find({ userId: user.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  return NextResponse.json({ jobs: jobs.map(clean) });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { type = 'selected', mediaIds = [], albumId, memoryId, name } = body;
  const db = await getDb();
  let ids = [];

  if (type === 'selected') {
    ids = Array.isArray(mediaIds) ? mediaIds : [];
  } else if (type === 'all') {
    const items = await db.collection('media')
      .find({ userId: user.id, trashed: { $ne: true } })
      .project({ id: 1 })
      .toArray();
    ids = items.map(item => item.id);
  } else if (type === 'album') {
    const album = await db.collection('shared_albums').findOne({ id: albumId, ownerUserId: user.id });
    if (!album) return NextResponse.json({ error: 'Album not found or not owned' }, { status: 404 });
    const links = await db.collection('shared_album_media').find({ albumId }).toArray();
    ids = links.map(link => link.mediaId);
  } else if (type === 'memory') {
    const memory = await db.collection('shared_memories').findOne({ id: memoryId, ownerUserId: user.id });
    if (!memory) return NextResponse.json({ error: 'Memory not found or not owned' }, { status: 404 });
    ids = memory.mediaIds || [];
  } else {
    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
  }

  if (!ids.length) return NextResponse.json({ error: 'No media to export' }, { status: 400 });

  const plan = effectivePlan(user, request);
  if (plan.id !== 'super_user' && ids.length > plan.downloadsPerDay) {
    return NextResponse.json(
      { error: `Export exceeds your daily limit of ${plan.downloadsPerDay} items. Upgrade for more.` },
      { status: 429 },
    );
  }

  if (type === 'selected') {
    const owned = await db.collection('media')
      .find({ id: { $in: ids }, userId: user.id })
      .project({ id: 1 })
      .toArray();
    ids = owned.map(item => item.id);
    if (!ids.length) return NextResponse.json({ error: 'No owned media in selection' }, { status: 403 });
  }

  const job = createJob({ userId: user.id, type, mediaIds: ids, name });
  await db.collection('export_jobs').insertOne(job);
  runExportJob(job.id).catch(error => console.error('[export] runner crashed', error));

  return NextResponse.json({ job: clean(job) });
}
