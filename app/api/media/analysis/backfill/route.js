import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { MAGIC_ANALYSIS_VERSION } from '@/lib/intelligence/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get('limit') || 6);
  const limit = Math.max(1, Math.min(12, Number.isFinite(requested) ? Math.floor(requested) : 6));
  const db = await getDb();

  // `magicAnalysisVersion` is mirrored onto media when a trusted local result
  // is stored. That keeps this backlog query bounded and index-friendly without
  // a $lookup across every media row.
  const rows = await db.collection('media').find({
    userId: user.id,
    trashed: { $ne: true },
    kind: 'photo',
    magicAnalysisVersion: { $ne: MAGIC_ANALYSIS_VERSION },
  }).project({ id: 1, name: 1, createdAt: 1 }).sort({ createdAt: 1 }).limit(limit).toArray();

  return NextResponse.json({
    version: MAGIC_ANALYSIS_VERSION,
    items: rows.map((row) => ({ id: row.id, name: row.name || '' })),
    count: rows.length,
    limit,
  });
}
