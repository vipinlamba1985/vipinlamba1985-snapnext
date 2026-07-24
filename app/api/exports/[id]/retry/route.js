import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { runExportJob } from '@/lib/exports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = await getDb();
  const job = await db.collection('export_jobs').findOne({ id: String(id || ''), userId: user.id });
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!['failed', 'expired'].includes(job.status)) {
    return NextResponse.json({ error: 'Only failed or expired jobs can be retried' }, { status: 400 });
  }

  await db.collection('export_jobs').updateOne(
    { id: job.id, userId: user.id },
    { $set: { status: 'queued', progress: 0, error: null, retriedAt: new Date() } },
  );
  runExportJob(job.id).catch(error => console.error('[export] retry runner crashed', error));
  return NextResponse.json({ ok: true });
}
