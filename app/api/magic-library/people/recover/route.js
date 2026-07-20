import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { cleanCluster, PEOPLE_INTELLIGENCE_VERSION } from '@/lib/people-intelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function recoveryReason(cluster = {}) {
  if (String(cluster.identityState || '').toLowerCase() === 'unknown') return 'Unknown';
  if (cluster.verificationStatus === 'rejected') return 'Rejected match';
  if (cluster.status === 'hidden') return 'Hidden';
  if (cluster.status === 'legacy' || Number(cluster.indexVersion || 0) !== PEOPLE_INTELLIGENCE_VERSION) return 'Older People version';
  return 'Excluded face';
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const rows = await db.collection('person_clusters').find({
    userId: user.id,
    representativeMediaId: { $exists: true, $ne: null },
    representativeFaceBox: { $exists: true, $ne: null },
    $or: [
      { status: { $in: ['hidden', 'rejected', 'legacy'] } },
      { verificationStatus: 'rejected' },
      { identityState: 'unknown' },
      { indexVersion: { $ne: PEOPLE_INTELLIGENCE_VERSION } },
    ],
  }).sort({ isSelf: -1, memoryCount: -1, representativeQuality: -1, updatedAt: -1 }).limit(200).toArray();

  const people = rows.map((row) => ({
    ...cleanCluster(row),
    recoveryReason: recoveryReason(row),
  }));

  return NextResponse.json({ people, count: people.length });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const clusterId = String(body.clusterId || '').trim();
  const action = String(body.action || '').trim();
  if (!clusterId || !['restore', 'self'].includes(action)) {
    return NextResponse.json({ error: 'Valid clusterId and action are required' }, { status: 400 });
  }

  const db = await getDb();
  const existing = await db.collection('person_clusters').findOne({ userId: user.id, clusterId });
  if (!existing) return NextResponse.json({ error: 'Person cluster not found' }, { status: 404 });

  if (action === 'self') {
    await db.collection('person_clusters').updateMany(
      { userId: user.id, clusterId: { $ne: clusterId }, isSelf: true },
      { $unset: { isSelf: '' }, $set: { updatedAt: new Date() } },
    );
  }

  const set = {
    status: 'active',
    verificationStatus: 'confirmed',
    identityState: 'person',
    indexVersion: PEOPLE_INTELLIGENCE_VERSION,
    isSelf: action === 'self',
    restoredAt: new Date(),
    updatedAt: new Date(),
  };
  if (action === 'self') set.displayName = 'You';

  const person = await db.collection('person_clusters').findOneAndUpdate(
    { userId: user.id, clusterId },
    {
      $set: set,
      $unset: { hiddenAt: '', rejectedAt: '', legacyAt: '' },
    },
    { returnDocument: 'after' },
  );

  return NextResponse.json({ ok: true, person: cleanCluster(person), action });
}
