import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { buildTriagePlan } from '@/lib/triage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Triage needs to see the whole library to be truthful about reclaimable space,
// so it reads far more rows than the paged gallery does. Only the metadata
// fields the plan actually uses are projected, which keeps a six-figure library
// to a few megabytes of documents and avoids pulling AI analysis entirely.
const TRIAGE_SCAN_LIMIT = 50_000;
const TRIAGE_PROJECTION = {
  _id: 0,
  id: 1,
  name: 1,
  size: 1,
  hash: 1,
  kind: 1,
  mime: 1,
  favorite: 1,
  isFavorite: 1,
  trashed: 1,
  createdAt: 1,
  capturedAt: 1,
  takenAt: 1,
  mediaCreatedAt: 1,
  uploadedAt: 1,
};

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDb();
    const items = await db.collection('media')
      .find({ userId: user.id })
      .project(TRIAGE_PROJECTION)
      .limit(TRIAGE_SCAN_LIMIT)
      .toArray();

    const plan = buildTriagePlan(items);
    return NextResponse.json(
      { ...plan, truncated: items.length >= TRIAGE_SCAN_LIMIT },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[triage]', error?.message || error);
    return NextResponse.json({ error: 'Triage could not run right now.' }, { status: 500 });
  }
}
