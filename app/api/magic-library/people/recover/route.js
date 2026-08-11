import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { cleanCluster, isGenericIdentityLabel, PEOPLE_INTELLIGENCE_VERSION } from '@/lib/people-intelligence';
import { normalizeFavoritePeople } from '@/lib/favorite-people';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function recoveryReason(cluster = {}) {
  if (String(cluster.identityState || '').toLowerCase() === 'unknown') return 'Unknown';
  if (cluster.verificationStatus === 'rejected') return 'Rejected match';
  if (cluster.status === 'hidden') return 'Hidden';
  if (cluster.status === 'legacy' || Number(cluster.indexVersion || 0) !== PEOPLE_INTELLIGENCE_VERSION) return 'Older People version';
  return 'Excluded face';
}

async function resolveFavoriteCluster(db, userId, existing) {
  if (Number(existing.indexVersion || 0) === PEOPLE_INTELLIGENCE_VERSION && existing.rekognitionUserId) return existing;

  // Cloud repair is deliberately limited to a person the user explicitly chose
  // as a Favourite. Older/general People are never re-indexed just to recover a
  // card, because that would recreate the broad recognition path we retired.
  const activation = await db.collection('magic_library_activation').findOne({ userId });
  const selected = normalizeFavoritePeople(activation?.recognitionFavorites || []);
  if (!selected.includes(String(existing.clusterId || ''))) return null;

  const enrollment = await db.collection('favorite_people_recognition').findOne({
    userId,
    clusterId: existing.clusterId,
    awsUserId: { $exists: true, $ne: null },
    'faceIds.0': { $exists: true },
  });
  if (!enrollment) return null;

  const now = new Date();
  await db.collection('person_clusters').updateOne(
    { userId, clusterId: existing.clusterId },
    {
      $set: {
        indexVersion: PEOPLE_INTELLIGENCE_VERSION,
        rekognitionUserId: enrollment.awsUserId,
        representativeMediaId: enrollment.referenceMediaId || existing.representativeMediaId,
        representativeFaceId: enrollment.faceIds?.[0] || existing.representativeFaceId,
        representativeFaceBox: enrollment.referenceFaceBox || existing.representativeFaceBox,
        representativeQuality: Number(enrollment.referenceQuality || existing.representativeQuality || 0),
        status: 'active',
        verificationStatus: 'confirmed',
        identityState: 'person',
        favoriteRecognition: { version: enrollment.version, enrolled: true, enrolledAt: enrollment.enrolledAt || now },
        updatedAt: now,
      },
    },
  );
  return db.collection('person_clusters').findOne({ userId, clusterId: existing.clusterId });
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const rows = await db.collection('person_clusters').find({
    userId: user.id,
    representativeMediaId: { $exists: true, $ne: null },
    $or: [
      { status: { $in: ['hidden', 'rejected', 'legacy'] } },
      { verificationStatus: 'rejected' },
      { identityState: 'unknown' },
      { indexVersion: { $ne: PEOPLE_INTELLIGENCE_VERSION } },
    ],
  }).sort({ isSelf: -1, memoryCount: -1, representativeQuality: -1, updatedAt: -1 }).limit(200).toArray();

  const people = rows.map((row) => ({ ...cleanCluster(row), recoveryReason: recoveryReason(row) }));
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

  let target = existing;
  if (Number(existing.indexVersion || 0) !== PEOPLE_INTELLIGENCE_VERSION || !existing.rekognitionUserId) {
    target = await resolveFavoriteCluster(db, user.id, existing);
    if (!target) {
      return NextResponse.json({
        error: 'This older face can be cloud-repaired only after you choose it as a Favourite Person and add a clear solo reference photo.',
        code: 'favorite_reference_required',
      }, { status: 409 });
    }
  }

  const now = new Date();
  if (action === 'self') {
    await db.collection('person_clusters').updateMany(
      { userId: user.id, clusterId: { $ne: clusterId }, isSelf: true },
      { $unset: { isSelf: '' }, $set: { updatedAt: now } },
    );
  }

  const set = {
    status: 'active',
    verificationStatus: 'confirmed',
    identityState: 'person',
    indexVersion: PEOPLE_INTELLIGENCE_VERSION,
    isSelf: action === 'self',
    restoredAt: now,
    updatedAt: now,
  };
  if (action === 'self') set.displayName = 'You';
  else if (existing.displayName && !isGenericIdentityLabel(existing.displayName)) set.displayName = existing.displayName;

  const person = await db.collection('person_clusters').findOneAndUpdate(
    { userId: user.id, clusterId, indexVersion: PEOPLE_INTELLIGENCE_VERSION },
    { $set: set, $unset: { hiddenAt: '', rejectedAt: '', legacyAt: '' } },
    { returnDocument: 'after' },
  );

  return NextResponse.json({ ok: true, person: cleanCluster(person), action, repairedIdentity: target !== existing });
}
