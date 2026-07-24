import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = await getDb();
  const job = await db.collection('export_jobs').findOne({ id: String(id || ''), userId: user.id });
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ job: clean(job) });
}
