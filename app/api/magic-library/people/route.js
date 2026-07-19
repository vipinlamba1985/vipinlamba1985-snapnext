import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { PEOPLE_INTELLIGENCE_VERSION, cleanCluster, isGenericIdentityLabel, isUsableFaceBox } from '@/lib/people-intelligence';
import { peopleIntelligenceReady } from '@/lib/people-intelligence.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dedupePeople(rows) {
  const seenUsers = new Set();
  const seenFaces = new Set();
  const seenNames = new Set();
  const output = [];
  for (const row of rows) {
    if (!isUsableFaceBox(row.representativeFaceBox)) continue;
    if (Number(row.representativeQuality || 0) < Number(process.env.PEOPLE_MIN_REPRESENTATIVE_QUALITY || 42)) continue;
    const userKey = String(row.rekognitionUserId || '');
    const faceKey = String(row.representativeFaceId || '');
    const nameKey = String(row.displayName || '').trim().toLowerCase();
    if ((userKey && seenUsers.has(userKey)) || (faceKey && seenFaces.has(faceKey)) || (nameKey && seenNames.has(nameKey))) continue;
    if (userKey) seenUsers.add(userKey);
    if (faceKey) seenFaces.add(faceKey);
    if (nameKey) seenNames.add(nameKey);
    output.push(row);
  }
  return output;
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const [rows, remaining] = await Promise.all([
    db.collection('person_clusters').find({
      userId: user.id,
      indexVersion: PEOPLE_INTELLIGENCE_VERSION,
      status: { $nin: ['hidden', 'rejected', 'legacy'] },
      representativeMediaId: { $exists: true, $ne: null },
      representativeFaceBox: { $exists: true, $ne: null },
    }).sort({ representativeQuality: -1, updatedAt: -1 }).limit(1000).toArray(),
    db.collection('media').countDocuments({
      userId: user.id,
      trashed: { $ne: true },
      kind: 'photo',
      'peopleIntelligence.version': { $ne: PEOPLE_INTELLIGENCE_VERSION },
    }),
  ]);
  const people = dedupePeople(rows).map(cleanCluster);
  return NextResponse.json({
    people,
    engineReady: peopleIntelligenceReady(),
    version: PEOPLE_INTELLIGENCE_VERSION,
    migrationRequired: remaining > 0,
    migrationRemaining: remaining,
    source: 'people_v3_clean_clusters',
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
  if (!displayName || isGenericIdentityLabel(displayName)) return NextResponse.json({ error: 'Choose a real name or relationship label.' }, { status: 400 });
  const db = await getDb();
  const result = await db.collection('person_clusters').findOneAndUpdate(
    { userId: user.id, clusterId, indexVersion: PEOPLE_INTELLIGENCE_VERSION },
    { $set: { displayName, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!result) return NextResponse.json({ error: 'Person cluster not found' }, { status: 404 });
  return NextResponse.json({ ok: true, person: cleanCluster(result) });
}
