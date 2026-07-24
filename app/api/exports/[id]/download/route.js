import fs from 'fs';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeFilename(name = 'export.zip') {
  const clean = String(name || 'export.zip').replace(/["\r\n]/g, '').slice(0, 180) || 'export.zip';
  return clean.toLowerCase().endsWith('.zip') ? clean : `${clean}.zip`;
}

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = await getDb();
  const job = await db.collection('export_jobs').findOne({ id: String(id || ''), userId: user.id });
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (job.status === 'expired') return NextResponse.json({ error: 'Export expired' }, { status: 410 });
  if (job.status !== 'ready') return NextResponse.json({ error: `Export ${job.status}` }, { status: 409 });
  if (!job.zipPath || !fs.existsSync(job.zipPath)) return NextResponse.json({ error: 'ZIP file missing' }, { status: 404 });

  try {
    const buffer = fs.readFileSync(job.zipPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeFilename(job.name)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[export-download] file read failed', job.id, error?.message);
    return NextResponse.json({ error: 'ZIP file unavailable' }, { status: 404 });
  }
}
