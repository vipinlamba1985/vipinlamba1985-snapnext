import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { isSuperUser } from '@/lib/entitlements';
import { storage } from '@/lib/storage';
import {
  PEOPLE_INTELLIGENCE_VERSION,
  clusterDisplayName,
  isUsableFaceBox,
} from '@/lib/people-intelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(data, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function dedupeVisiblePeople(rows) {
  const seenUsers = new Set();
  const seenFaces = new Set();
  const seenNames = new Set();
  const minimumQuality = Number(process.env.PEOPLE_MIN_REPRESENTATIVE_QUALITY || 10);
  const output = [];

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

async function listAllS3Objects(userId) {
  if (storage.active() !== 's3') return [];
  const objects = [];
  let continuationToken;
  let pages = 0;

  do {
    const page = await storage.listUserObjects({ userId, continuationToken, maxKeys: 1000 });
    objects.push(...(page.objects || []));
    continuationToken = page.nextContinuationToken || undefined;
    pages += 1;
    if (pages >= 100) throw new Error('Storage audit exceeded 100,000 objects. Contact support for a paginated audit.');
  } while (continuationToken);

  return objects;
}

function mediaClusterIds(item) {
  return Array.isArray(item.peopleIntelligence?.clusterIds)
    ? item.peopleIntelligence.clusterIds.map(String)
    : [];
}

export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (!isSuperUser(user)) return json({ error: 'Admin access required' }, 403);

    const db = await getDb();
    const [media, clusterRows, s3Objects] = await Promise.all([
      db.collection('media').find(
        { userId: user.id },
        { projection: { _id: 0, id: 1, name: 1, kind: 1, size: 1, provider: 1, storageKey: 1, trashed: 1, peopleIntelligence: 1 } },
      ).toArray(),
      db.collection('person_clusters').find({
        userId: user.id,
        indexVersion: PEOPLE_INTELLIGENCE_VERSION,
        status: { $nin: ['hidden', 'rejected', 'legacy'] },
        representativeMediaId: { $exists: true, $ne: null },
        representativeFaceBox: { $exists: true, $ne: null },
      }).sort({ isSelf: -1, representativeQuality: -1, updatedAt: -1 }).limit(1000).toArray(),
      listAllS3Objects(user.id),
    ]);

    const liveMedia = media.filter((item) => item.trashed !== true);
    const trashedMedia = media.filter((item) => item.trashed === true);
    const dbS3Records = media.filter((item) => item.provider === 's3' && item.storageKey);
    const liveS3Records = liveMedia.filter((item) => item.provider === 's3' && item.storageKey);
    const s3ByKey = new Map(s3Objects.map((item) => [String(item.storageKey), item]));
    const dbByKey = new Map(dbS3Records.map((item) => [String(item.storageKey), item]));

    const missingInAws = dbS3Records
      .filter((item) => !s3ByKey.has(String(item.storageKey)))
      .map((item) => ({ id: item.id, name: item.name, kind: item.kind, trashed: Boolean(item.trashed), storageKey: item.storageKey }));
    const orphanInAws = s3Objects
      .filter((item) => !dbByKey.has(String(item.storageKey)))
      .map((item) => ({ storageKey: item.storageKey, size: item.size, lastModified: item.lastModified }));
    const sizeMismatches = dbS3Records
      .filter((item) => {
        const object = s3ByKey.get(String(item.storageKey));
        return object && Number(item.size || 0) !== Number(object.size || 0);
      })
      .map((item) => ({
        id: item.id,
        name: item.name,
        storageKey: item.storageKey,
        databaseBytes: Number(item.size || 0),
        awsBytes: Number(s3ByKey.get(String(item.storageKey))?.size || 0),
      }));

    const livePhotos = liveMedia.filter((item) => item.kind === 'photo');
    const liveVideos = liveMedia.filter((item) => item.kind === 'video');
    const liveOther = liveMedia.filter((item) => !['photo', 'video'].includes(item.kind));
    const livePhotosSafeInAws = livePhotos.filter((item) => {
      if (item.provider !== 's3' || !item.storageKey) return false;
      const object = s3ByKey.get(String(item.storageKey));
      return object && Number(object.size || 0) === Number(item.size || 0);
    });

    const visiblePeople = dedupeVisiblePeople(clusterRows);
    const people = visiblePeople.map((cluster) => {
      const clusterId = String(cluster.clusterId || '');
      const personMedia = liveMedia.filter((item) => mediaClusterIds(item).includes(clusterId));
      const safelyStored = personMedia.filter((item) => {
        if (item.provider !== 's3' || !item.storageKey) return false;
        const object = s3ByKey.get(String(item.storageKey));
        return object && Number(object.size || 0) === Number(item.size || 0);
      });
      const historicalCount = Array.isArray(cluster.mediaIds) ? new Set(cluster.mediaIds.map(String)).size : 0;
      return {
        clusterId,
        name: clusterDisplayName(cluster),
        thumbnailCount: personMedia.length,
        galleryCount: personMedia.length,
        awsSafeCount: safelyStored.length,
        photos: personMedia.filter((item) => item.kind === 'photo').length,
        videos: personMedia.filter((item) => item.kind === 'video').length,
        historicalCount,
        countMatchesGallery: true,
        allMemoriesSafeInAws: safelyStored.length === personMedia.length,
      };
    });

    const totalPersonMemberships = people.reduce((sum, person) => sum + person.galleryCount, 0);
    const uniqueMemoriesWithPeople = liveMedia.filter((item) => mediaClusterIds(item).some((id) => people.some((person) => person.clusterId === id))).length;
    const storageHealthy = missingInAws.length === 0 && orphanInAws.length === 0 && sizeMismatches.length === 0;
    const everyLivePhotoSafeInAws = livePhotosSafeInAws.length === livePhotos.length;
    const everyPersonCountMatches = people.every((person) => person.thumbnailCount === person.galleryCount);

    return json({
      generatedAt: new Date(),
      account: { id: user.id, email: user.email || null },
      verdict: {
        storageHealthy,
        everyLivePhotoSafeInAws,
        everyPersonCountMatches,
        exactGalleryAndAwsObjectCountsExpectedToMatch: false,
        explanation: 'Gallery excludes Trash. AWS keeps Trash until permanent deletion and can also contain orphan objects. Compare live gallery records with verified live AWS objects, not raw bucket totals.',
      },
      gallery: {
        liveMemories: liveMedia.length,
        photos: livePhotos.length,
        videos: liveVideos.length,
        other: liveOther.length,
        trash: trashedMedia.length,
      },
      aws: {
        activeProvider: storage.active(),
        actualObjects: s3Objects.length,
        trackedDatabaseObjects: dbS3Records.length,
        trackedLiveObjects: liveS3Records.length,
        trackedTrashObjects: dbS3Records.filter((item) => item.trashed === true).length,
        verifiedLivePhotos: livePhotosSafeInAws.length,
        missingInAwsCount: missingInAws.length,
        orphanInAwsCount: orphanInAws.length,
        sizeMismatchCount: sizeMismatches.length,
      },
      people: {
        visiblePeople: people.length,
        uniqueMemoriesWithPeople,
        totalPersonMemberships,
        allIndividualCountsMatch: everyPersonCountMatches,
        note: 'Total person memberships can be greater than gallery photos because one group photo belongs to several people. Photos without recognized faces belong to no person.',
        rows: people,
      },
      mismatches: {
        missingInAws: missingInAws.slice(0, 100),
        orphanInAws: orphanInAws.slice(0, 100),
        sizeMismatches: sizeMismatches.slice(0, 100),
        truncated: missingInAws.length > 100 || orphanInAws.length > 100 || sizeMismatches.length > 100,
      },
      privacy: 'Private super-user audit. No media bytes, signed URLs, face IDs or image contents are returned.',
    });
  } catch (error) {
    console.error('[storage-consistency-audit] failed', error?.message);
    return json({ error: error?.message || 'Storage consistency audit failed.' }, 500);
  }
}
