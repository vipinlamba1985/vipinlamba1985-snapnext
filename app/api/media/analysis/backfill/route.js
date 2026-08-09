import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { intelligenceConfig, MAGIC_ANALYSIS_VERSION } from '@/lib/intelligence/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = intelligenceConfig();
  const enabled = Boolean(config.magicSorterEnabled && config.localFaceGateEnabled && config.faceProcessingEnabled);
  if (!enabled) {
    return NextResponse.json({ enabled: false, version: MAGIC_ANALYSIS_VERSION, items: [], count: 0, limit: 0, nextCursor: null });
  }

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get('limit') || 6);
  const limit = Math.max(1, Math.min(12, Number.isFinite(requested) ? Math.floor(requested) : 6));
  const cursor = String(url.searchParams.get('cursor') || '').trim().slice(0, 200);
  const now = new Date();
  const db = await getDb();

  const query = {
    userId: user.id,
    trashed: { $ne: true },
    kind: 'photo',
    magicAnalysisVersion: { $ne: MAGIC_ANALYSIS_VERSION },
    $or: [
      { magicAnalysisRetryAt: { $exists: false } },
      { magicAnalysisRetryAt: null },
      { magicAnalysisRetryAt: { $lte: now } },
    ],
  };
  if (cursor) query.id = { $gt: cursor };

  // Stable id-order plus a cursor prevents a bad early file from trapping every
  // visit on the same page. Failure backoff keeps that file out until retryAt.
  const rows = await db.collection('media').find(query)
    .project({ id: 1, name: 1 })
    .sort({ id: 1 })
    .limit(limit)
    .toArray();

  const nextCursor = rows.length === limit ? String(rows.at(-1)?.id || '') || null : null;
  return NextResponse.json({
    enabled: true,
    version: MAGIC_ANALYSIS_VERSION,
    items: rows.map((row) => ({ id: row.id, name: row.name || '' })),
    count: rows.length,
    limit,
    nextCursor,
  });
}
