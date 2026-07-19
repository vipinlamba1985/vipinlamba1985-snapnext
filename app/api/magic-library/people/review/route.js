import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { cleanCluster } from '@/lib/people-intelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const people = await db.collection('person_clusters').find({
    userId: user.id,
    status: { $ne: 'hidden' },
    verificationStatus: 'suggested',
    representativeMediaId: { $exists: true, $ne: null },
  }).sort({ bestSimilarity: -1, updatedAt: -1 }).limit(100).toArray();
  return NextResponse.json({ people: people.map(cleanCluster), count: people.length });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const clusterId = String(body.clusterId || '').trim();
  const action = String(body.action || '').trim();
  if (!clusterId || !['confirm', 'reject', 'hide'].includes(action)) {
    return NextResponse.json({ error: 'Valid clusterId and action are required' }, { status: 400 });
  }
  const db = await getDb();
  const changes = action === 'confirm'
    ? { verificationStatus: 'confirmed', status: 'active', confirmedAt: new Date(), updatedAt: new Date() }
    : action === 'reject'
      ? { verificationStatus: 'rejected', status: 'discovered', rejectedAt: new Date(), updatedAt: new Date() }
      : { status: 'hidden', hiddenAt: new Date(), updatedAt: new Date() };
  const person = await db.collection('person_clusters').findOneAndUpdate(
    { userId: user.id, clusterId },
    { $set: changes },
    { returnDocument: 'after' },
  );
  if (!person) return NextResponse.json({ error: 'Person cluster not found' }, { status: 404 });
  return NextResponse.json({ ok: true, person: cleanCluster(person) });
}
