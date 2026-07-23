import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { PEOPLE_INTELLIGENCE_VERSION, cleanCluster, isGenericIdentityLabel, isUsableFaceBox } from '@/lib/people-intelligence';
import { normalizePeopleIdentityState, PEOPLE_IDENTITY_UNKNOWN } from '@/lib/people-identity';
import { peopleIntelligenceReady } from '@/lib/people-intelligence.server';
import { sanitizeThumbnailCrop } from '@/lib/people-thumbnail';
import { personThumbnailEligibility } from '@/lib/people-gallery-rules';
import { choosePersonCounts, historicalPersonMediaIds, shouldUseHistoricalPersonFallback } from '@/lib/people-count-reconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dedupePeople(rows) {
  const seenUsers = new Set();
  const seenFaces = new Set();
  const seenNames = new Set();
  const output = [];
  const minimumQuality = Number(process.env.PEOPLE_MIN_REPRESENTATIVE_QUALITY || 10);
  for (const row of rows) {
    const explicitlyRestored = Boolean(row.isSelf || row.restoredAt);
    if (!explicitlyRestored && !isUsableFaceBox(row.representativeFaceBox)) continue;
    if (!explicitlyRestored && Number(row.representativeQuality || 0) < minimumQuality) continue;
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

async function liveCountsByCluster(db, userId, clusterIds) {
  if (!clusterIds.length) return new Map();
  const rows = await db.collection('media').aggregate([
    {
      $match: {
        userId,
        trashed: { $ne: true },
        'peopleIntelligence.clusterIds': { $in: clusterIds },
      },
    },
    { $unwind: '$peopleIntelligence.clusterIds' },
    { $match: { 'peopleIntelligence.clusterIds': { $in: clusterIds } } },
    {
      $group: {
        _id: '$peopleIntelligence.clusterIds',
        count: { $sum: 1 },
        photos: { $sum: { $cond: [{ $eq: ['$kind', 'photo'] }, 1, 0] } },
        videos: { $sum: { $cond: [{ $eq: ['$kind', 'video'] }, 1, 0] } },
      },
    },
  ]).toArray();
  return new Map(rows.map((row) => [String(row._id), row]));
}

async function historicalCountsByCluster(db, userId, people, liveCounts) {
  const candidates = people.map((person) => {
    const live = liveCounts.get(String(person.clusterId)) || { count: 0 };
    if (!shouldUseHistoricalPersonFallback(person, live.count)) return null;
    return { person, mediaIds: historicalPersonMediaIds(person) };
  }).filter(Boolean);
  if (!candidates.length) return new Map();

  const allMediaIds = [...new Set(candidates.flatMap((candidate) => candidate.mediaIds))];
  const media = await db.collection('media').find({
    userId,
    trashed: { $ne: true },
    id: { $in: allMediaIds },
  }).project({ id: 1, kind: 1 }).toArray();
  const mediaById = new Map(media.map((item) => [String(item.id), item]));

  return new Map(candidates.map(({ person, mediaIds }) => {
    const linked = mediaIds.map((mediaId) => mediaById.get(String(mediaId))).filter(Boolean);
    return [String(person.clusterId), {
      count: linked.length,
      photos: linked.filter((item) => item.kind === 'photo').length,
      videos: linked.filter((item) => item.kind === 'video').length,
    }];
  }));
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const [rows, remaining, activation] = await Promise.all([
    db.collection('person_clusters').find({
      userId: user.id,
      indexVersion: PEOPLE_INTELLIGENCE_VERSION,
      status: { $nin: ['hidden', 'rejected', 'legacy'] },
      representativeMediaId: { $exists: true, $ne: null },
      representativeFaceBox: { $exists: true, $ne: null },
    }).sort({ isSelf: -1, representativeQuality: -1, updatedAt: -1 }).limit(1000).toArray(),
    db.collection('media').countDocuments({
      userId: user.id,
      trashed: { $ne: true },
      kind: 'photo',
      $or: [
        { 'peopleIntelligence.version': { $ne: PEOPLE_INTELLIGENCE_VERSION } },
        { 'peopleIntelligence.status': { $in: ['queued', 'failed'] } },
        { 'peopleIntelligence.status': 'completed', 'peopleIntelligence.faceIds.0': { $exists: false } },
      ],
    }),
    db.collection('magic_library_activation').findOne({ userId: user.id }),
  ]);
  const activeNames = activation?.active || [];
  const deduped = dedupePeople(rows);
  const selfRepair = deduped.find((row) => row.isSelf && !row.rekognitionUserId) || null;
  const liveCounts = await liveCountsByCluster(db, user.id, deduped.map((row) => row.clusterId).filter(Boolean));
  const historicalCounts = await historicalCountsByCluster(db, user.id, deduped, liveCounts);
  const people = deduped.map((row) => {
    const live = liveCounts.get(String(row.clusterId)) || { count: 0, photos: 0, videos: 0 };
    const historical = historicalCounts.get(String(row.clusterId)) || null;
    const counts = choosePersonCounts(row, live, historical);
    const identityRepairRequired = Boolean(row.isSelf && !row.rekognitionUserId);
    const countPending = remaining > 0 || identityRepairRequired;
    const eligibility = personThumbnailEligibility({
      ...row,
      name: row.clusterId,
      livePhotoCount: counts.photos,
    }, activeNames);
    return {
      ...cleanCluster({
        ...row,
        liveMemoryCount: counts.count,
        livePhotoCount: counts.photos,
        liveVideoCount: counts.videos,
      }),
      distinctPhotoCount: eligibility.photoCount,
      thumbnailEligible: eligibility.eligible,
      thumbnailEligibilityReason: eligibility.reason,
      countSource: counts.source,
      countReconciled: counts.reconciled,
      countPending,
      identityRepairRequired,
    };
  });
  const eligiblePeopleCount = people.filter((person) => person.thumbnailEligible).length;
  const selfRepairRequired = Boolean(selfRepair);
  return NextResponse.json({
    people,
    eligiblePeopleCount,
    suppressedOneOffCount: Math.max(0, people.length - eligiblePeopleCount),
    engineReady: peopleIntelligenceReady(),
    version: PEOPLE_INTELLIGENCE_VERSION,
    migrationRequired: remaining > 0 || selfRepairRequired,
    migrationRemaining: remaining,
    selfRepairRequired,
    selfRepairClusterId: selfRepair?.clusterId || null,
    source: 'people_v3_recurring_face_thumbnails',
    hiddenWeakOrDuplicateCount: Math.max(0, rows.length - deduped.length),
  });
}

export async function PATCH(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const clusterId = String(body.clusterId || '').trim();
  const hasDisplayName = Object.prototype.hasOwnProperty.call(body, 'displayName');
  const hasThumbnailCrop = Object.prototype.hasOwnProperty.call(body, 'thumbnailCrop');
  const hasIdentityState = Object.prototype.hasOwnProperty.call(body, 'identityState');

  if (!clusterId) return NextResponse.json({ error: 'clusterId is required' }, { status: 400 });
  if (!hasDisplayName && !hasThumbnailCrop && !hasIdentityState) return NextResponse.json({ error: 'No person changes supplied.' }, { status: 400 });

  const set = { updatedAt: new Date() };
  const unset = {};

  if (hasDisplayName) {
    const displayName = String(body.displayName || '').trim().slice(0, 80);
    if (!displayName || isGenericIdentityLabel(displayName)) return NextResponse.json({ error: 'Choose a real name or relationship label.' }, { status: 400 });
    set.displayName = displayName;
  }

  if (hasThumbnailCrop) {
    if (body.thumbnailCrop === null) unset.thumbnailCrop = '';
    else set.thumbnailCrop = sanitizeThumbnailCrop(body.thumbnailCrop);
  }

  if (hasIdentityState) set.identityState = normalizePeopleIdentityState(body.identityState);

  const update = { $set: set };
  if (Object.keys(unset).length) update.$unset = unset;

  const db = await getDb();
  const result = await db.collection('person_clusters').findOneAndUpdate(
    { userId: user.id, clusterId, indexVersion: PEOPLE_INTELLIGENCE_VERSION },
    update,
    { returnDocument: 'after' },
  );
  if (!result) return NextResponse.json({ error: 'Person cluster not found' }, { status: 404 });

  const markedUnknown = hasIdentityState && set.identityState === PEOPLE_IDENTITY_UNKNOWN;
  if (markedUnknown) {
    await db.collection('magic_library_activation').updateOne(
      { userId: user.id },
      { $pull: { active: clusterId }, $set: { updatedAt: new Date() } },
    );
  }

  return NextResponse.json({ ok: true, person: cleanCluster(result), deactivated: markedUnknown });
}
