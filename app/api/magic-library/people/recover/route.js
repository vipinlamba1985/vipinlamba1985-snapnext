import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { cleanCluster, isGenericIdentityLabel, PEOPLE_INTELLIGENCE_VERSION } from '@/lib/people-intelligence';
import { indexMediaFaces } from '@/lib/people-intelligence.server';
import { closestFaceIndex, replaceActiveCluster } from '@/lib/people-recovery';

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

async function faceRowsForMedia(db, userId, mediaId) {
  return db.collection('face_index').find({
    userId,
    mediaId,
    indexVersion: PEOPLE_INTELLIGENCE_VERSION,
    clusterId: { $exists: true, $ne: null },
  }).toArray();
}

async function resolveV3Cluster(db, userId, existing) {
  if (Number(existing.indexVersion || 0) === PEOPLE_INTELLIGENCE_VERSION && existing.rekognitionUserId) return existing;
  const mediaId = String(existing.representativeMediaId || '').trim();
  if (!mediaId) return null;

  let rows = await faceRowsForMedia(db, userId, mediaId);
  let match = closestFaceIndex(rows, existing.representativeFaceBox || {});

  if (!match) {
    const media = await db.collection('media').findOne({ userId, id: mediaId, trashed: { $ne: true }, kind: 'photo' });
    if (!media) return null;
    const forcedItem = {
      ...media,
      peopleIntelligence: {
        ...(media.peopleIntelligence || {}),
        version: PEOPLE_INTELLIGENCE_VERSION,
        status: 'queued',
      },
    };
    await indexMediaFaces({ db, userId, item: forcedItem });
    rows = await faceRowsForMedia(db, userId, mediaId);
    match = closestFaceIndex(rows, existing.representativeFaceBox || {});
  }

  if (!match?.clusterId) return null;
  return db.collection('person_clusters').findOne({
    userId,
    clusterId: match.clusterId,
    indexVersion: PEOPLE_INTELLIGENCE_VERSION,
  });
}

async function replaceActivationCluster(db, userId, previousClusterId, nextClusterId) {
  if (!previousClusterId || !nextClusterId || previousClusterId === nextClusterId) return;
  const activation = await db.collection('magic_library_activation').findOne({ userId });
  if (!activation) return;
  const nextActive = replaceActiveCluster(activation.active || [], previousClusterId, nextClusterId);
  await db.collection('magic_library_activation').updateOne(
    { userId },
    { $set: { active: nextActive, updatedAt: new Date() } },
  );
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

  let target = existing;
  if (Number(existing.indexVersion || 0) !== PEOPLE_INTELLIGENCE_VERSION || !existing.rekognitionUserId) {
    try {
      target = await resolveV3Cluster(db, user.id, existing);
    } catch (error) {
      console.error('[people-recovery] representative reindex failed', error?.name, error?.message);
      return NextResponse.json({
        error: 'SnapNext could not reconnect this older face yet. Please retry after the People scan is available.',
        code: 'people_recovery_reindex_failed',
      }, { status: 503 });
    }
    if (!target) {
      return NextResponse.json({
        error: 'This older face needs a clear source photo before it can be restored.',
        code: 'people_recovery_face_not_found',
      }, { status: 409 });
    }
  }

  const targetClusterId = String(target.clusterId || '');
  const now = new Date();
  if (action === 'self') {
    await db.collection('person_clusters').updateMany(
      { userId: user.id, clusterId: { $ne: targetClusterId }, isSelf: true },
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
    { userId: user.id, clusterId: targetClusterId, indexVersion: PEOPLE_INTELLIGENCE_VERSION },
    {
      $set: set,
      $unset: { hiddenAt: '', rejectedAt: '', legacyAt: '' },
    },
    { returnDocument: 'after' },
  );

  if (targetClusterId !== clusterId) {
    await db.collection('person_clusters').updateOne(
      { userId: user.id, clusterId },
      {
        $set: {
          status: 'legacy',
          isSelf: false,
          supersededByClusterId: targetClusterId,
          supersededAt: now,
          updatedAt: now,
        },
      },
    );
    await replaceActivationCluster(db, user.id, clusterId, targetClusterId);
  }

  return NextResponse.json({
    ok: true,
    person: cleanCluster(person),
    action,
    repairedIdentity: targetClusterId !== clusterId,
    previousClusterId: targetClusterId !== clusterId ? clusterId : null,
  });
}
