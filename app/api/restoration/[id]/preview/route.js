import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { downloadRestorationOutput } from '@/lib/restoration/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const jobId = String(id || '').trim().slice(0, 100);
  if (!jobId) return NextResponse.json({ error: 'Restoration job is required.' }, { status: 400 });

  const db = await getDb();
  const job = await db.collection('photo_restoration_jobs').findOne({
    id: jobId,
    userId: user.id,
    status: { $in: ['completed', 'saved'] },
  });
  if (!job?.outputUrl) return NextResponse.json({ error: 'Restoration preview is unavailable.' }, { status: 404 });
  if (job.outputExpiresAt && new Date(job.outputExpiresAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This temporary preview has expired.' }, { status: 410 });
  }

  try {
    const { buffer, mimeType } = await downloadRestorationOutput(job.outputUrl);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  } catch (error) {
    console.error('[restoration-preview] failed', jobId, error?.code || error?.message);
    return NextResponse.json({
      error: 'The restoration preview is temporarily unavailable.',
      code: error?.code || 'restoration_preview_failed',
    }, { status: error?.code === 'restoration_output_unavailable' ? 410 : 502 });
  }
}
