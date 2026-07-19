import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { cleanCluster, isGenericIdentityLabel, isUsableFaceBox } from '@/lib/people-intelligence';
import { peopleIntelligenceReady } from '@/lib/people-intelligence.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dedupePeople(rows) {
  const seen = new Set();
  const output = [];
  for (const row of rows) {
    if (!isUsableFaceBox(row.representativeFaceBox)) continue;
    if (Number(row.representativeQuality || 0) < Number(process.env.PEOPLE_MIN_REPRESENTATIVE_QUALITY || 12)) continue;
    const keys = [
      row.rekognitionUserId ? `user:${row.rekognitionUserId}` : null,
      row.representativeFaceId ? `face:${row.representativeFaceId}` : null,
      row.displayName ? `name:${String(row.displayName).trim().toLowerCase()}` : null,
    ].filter(Boolean);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    output.push(row);
  }
  return output;
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const rows = await db.collection('person_clusters').find({
    userId: user.id,
    status: { $ne: 'hidden' },
    representativeMediaId: { $exists: true, $ne: null },
    representativeFaceBox: { $exists: true, $ne: null },
  }).sort({ representativeQuality: -1, updatedAt: -1 }).limit(1000).toArray();

  const people = dedupePeople(rows).map(cleanCluster);
  return NextResponse.json({
    people,
    engineReady: peopleIntelligenceReady(),
    source: 'deduplicated_face_clusters',
    hiddenWeakOrDuplicateCount: Math.max(0, rows.length - people.length),
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
