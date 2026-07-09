import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { cleanCluster, isGenericIdentityLabel } from '@/lib/people-intelligence';
import { peopleIntelligenceReady } from '@/lib/people-intelligence.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const rows = await db.collection('person_clusters').find({
    userId: user.id,
    status: { $ne: 'hidden' },
    representativeMediaId: { $exists: true, $ne: null },
  }).sort({ representativeQuality: -1, updatedAt: -1 }).limit(1000).toArray();

  return NextResponse.json({
    people: rows.map(cleanCluster),
    engineReady: peopleIntelligenceReady(),
    source: 'face_clusters',
  });
}

export async function PATCH(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const clusterId = String(body.clusterId || '').trim();
  const displayName = String(body.displayName || '').trim().slice(0, 80);
  if (!clusterId) return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
  if (!displayName || isGenericIdentityLabel(displayName)) {
    return NextResponse.json({ error: 'Choose a real name or relationship label.' }, { status: 400 });
  }

  const db = await getDb();
  const result = await db.collection('person_clusters').findOneAndUpdate(
    { userId: user.id, clusterId },
    { $set: { displayName, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!result) return NextResponse.json({ error: 'Person cluster not found' }, { status: 404 });
  return NextResponse.json({ ok: true, person: cleanCluster(result) });
}
