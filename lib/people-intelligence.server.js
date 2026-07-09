import { v4 as uuidv4 } from 'uuid';
import { storage } from '@/lib/storage';
import {
  FACE_MATCH_THRESHOLD,
  PEOPLE_INTELLIGENCE_VERSION,
  cleanFaceBox,
  eligibleForPeopleIndex,
  faceQualityScore,
  peopleCollectionId,
} from '@/lib/people-intelligence';

let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = import('@aws-sdk/client-rekognition').then(({ RekognitionClient }) => new RekognitionClient({
      region: process.env.AWS_REGION,
      credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      } : undefined,
    }));
  }
  return clientPromise;
}

export function peopleIntelligenceReady() {
  return Boolean(process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

async function ensureCollection(userId) {
  const client = await getClient();
  const { CreateCollectionCommand } = await import('@aws-sdk/client-rekognition');
  const collectionId = peopleCollectionId(userId);
  try {
    await client.send(new CreateCollectionCommand({ CollectionId: collectionId, Tags: { app: 'snapnext', purpose: 'people-intelligence' } }));
  } catch (error) {
    if (error?.name !== 'ResourceAlreadyExistsException') throw error;
  }
  return collectionId;
}

async function resetCollection(userId) {
  const client = await getClient();
  const { DeleteCollectionCommand } = await import('@aws-sdk/client-rekognition');
  const collectionId = peopleCollectionId(userId);
  try {
    await client.send(new DeleteCollectionCommand({ CollectionId: collectionId }));
  } catch (error) {
    if (error?.name !== 'ResourceNotFoundException') throw error;
  }
  return ensureCollection(userId);
}

function imageInputFor(item, buffer) {
  if (item.provider === 's3' && item.storageKey && process.env.AWS_S3_BUCKET) {
    return { S3Object: { Bucket: process.env.AWS_S3_BUCKET, Name: item.storageKey } };
  }
  return { Bytes: buffer };
}

async function findExistingCluster(db, userId, collectionId, faceId, mediaId) {
  const client = await getClient();
  const { SearchFacesCommand } = await import('@aws-sdk/client-rekognition');
  const result = await client.send(new SearchFacesCommand({
    CollectionId: collectionId,
    FaceId: faceId,
    FaceMatchThreshold: Number(process.env.PEOPLE_FACE_MATCH_THRESHOLD || FACE_MATCH_THRESHOLD),
    MaxFaces: 20,
  }));

  const matches = (result.FaceMatches || [])
    .filter((match) => match.Face?.FaceId && match.Face.FaceId !== faceId)
    .sort((a, b) => Number(b.Similarity || 0) - Number(a.Similarity || 0));

  if (!matches.length) return null;
  const ids = matches.map((match) => match.Face.FaceId);
  const known = await db.collection('face_index').find({
    userId,
    faceId: { $in: ids },
    mediaId: { $ne: mediaId },
  }).toArray();
  const byId = new Map(known.map((row) => [row.faceId, row]));

  for (const match of matches) {
    const row = byId.get(match.Face.FaceId);
    if (row?.clusterId) return { clusterId: row.clusterId, similarity: Number(match.Similarity || 0) };
  }
  return null;
}

async function upsertCluster(db, { userId, clusterId, mediaId, faceId, faceBox, quality }) {
  const now = new Date();
  await db.collection('person_clusters').updateOne(
    { userId, clusterId },
    {
      $setOnInsert: {
        userId,
        clusterId,
        displayName: null,
        status: 'discovered',
        createdAt: now,
      },
      $set: { updatedAt: now },
      $addToSet: { mediaIds: mediaId, faceIds: faceId },
    },
    { upsert: true },
  );

  const cluster = await db.collection('person_clusters').findOne({ userId, clusterId });
  if (!cluster?.representativeMediaId || quality > Number(cluster.representativeQuality || 0)) {
    await db.collection('person_clusters').updateOne(
      { userId, clusterId },
      {
        $set: {
          representativeMediaId: mediaId,
          representativeFaceId: faceId,
          representativeFaceBox: faceBox,
          representativeQuality: quality,
          updatedAt: now,
        },
      },
    );
  }
}

export async function indexMediaFaces({ db, userId, item }) {
  const existing = item.peopleIntelligence;
  if (existing?.version === PEOPLE_INTELLIGENCE_VERSION && ['completed', 'skipped'].includes(existing?.status)) {
    return { status: existing.status, faces: existing.faceIds?.length || 0, clusters: existing.clusterIds || [] };
  }

  if (!eligibleForPeopleIndex(item)) {
    await db.collection('media').updateOne(
      { id: item.id, userId },
      {
        $set: {
          peopleIntelligence: {
            version: PEOPLE_INTELLIGENCE_VERSION,
            status: 'skipped',
            reason: 'not_eligible',
            indexedAt: new Date(),
            faceIds: [],
            clusterIds: [],
          },
        },
      },
    );
    return { status: 'skipped', reason: 'not_eligible', faces: 0, clusters: [] };
  }

  const collectionId = await ensureCollection(userId);
  let buffer = null;
  if (item.provider !== 's3') {
    buffer = await storage.read({ provider: item.provider, storageKey: item.storageKey });
  }

  const client = await getClient();
  const { IndexFacesCommand } = await import('@aws-sdk/client-rekognition');
  const result = await client.send(new IndexFacesCommand({
    CollectionId: collectionId,
    Image: imageInputFor(item, buffer),
    ExternalImageId: String(item.id).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 255),
    DetectionAttributes: ['DEFAULT'],
    QualityFilter: 'AUTO',
  }));

  const faceIds = [];
  const clusterIds = [];
  for (const record of result.FaceRecords || []) {
    const faceId = record.Face?.FaceId;
    if (!faceId) continue;
    const faceBox = cleanFaceBox(record.Face?.BoundingBox || record.FaceDetail?.BoundingBox || {});
    const quality = faceQualityScore(record.FaceDetail || {}, record.Face || {});
    const matched = await findExistingCluster(db, userId, collectionId, faceId, item.id);
    const clusterId = matched?.clusterId || uuidv4();

    await db.collection('face_index').updateOne(
      { userId, faceId },
      {
        $set: {
          userId,
          faceId,
          mediaId: item.id,
          clusterId,
          boundingBox: faceBox,
          quality,
          confidence: Number(record.Face?.Confidence || record.FaceDetail?.Confidence || 0),
          matchedSimilarity: matched?.similarity || null,
          indexedAt: new Date(),
        },
      },
      { upsert: true },
    );
    await upsertCluster(db, { userId, clusterId, mediaId: item.id, faceId, faceBox, quality });
    faceIds.push(faceId);
    if (!clusterIds.includes(clusterId)) clusterIds.push(clusterId);
  }

  await db.collection('media').updateOne(
    { id: item.id, userId },
    {
      $set: {
        peopleIntelligence: {
          version: PEOPLE_INTELLIGENCE_VERSION,
          status: 'completed',
          indexedAt: new Date(),
          faceIds,
          clusterIds,
        },
      },
    },
  );

  return { status: 'completed', faces: faceIds.length, clusters: clusterIds };
}

export async function rebuildPeopleIntelligence({ db, userId, limit = 12, reset = false }) {
  if (!peopleIntelligenceReady()) {
    const error = new Error('People Intelligence is not configured for this environment.');
    error.code = 'people_engine_not_configured';
    throw error;
  }

  if (reset) {
    await resetCollection(userId);
    await Promise.all([
      db.collection('face_index').deleteMany({ userId }),
      db.collection('person_clusters').deleteMany({ userId }),
      db.collection('media').updateMany({ userId }, { $unset: { peopleIntelligence: '' } }),
    ]);
  } else {
    await ensureCollection(userId);
  }

  const candidates = await db.collection('media').find({
    userId,
    trashed: { $ne: true },
    kind: 'photo',
    $or: [
      { 'peopleIntelligence.version': { $ne: PEOPLE_INTELLIGENCE_VERSION } },
      { 'peopleIntelligence.status': { $nin: ['completed', 'skipped', 'failed'] } },
    ],
  }).sort({ createdAt: 1 }).limit(Math.max(1, Math.min(30, Number(limit || 12)))).toArray();

  const results = [];
  for (const item of candidates) {
    try {
      results.push({ mediaId: item.id, ...(await indexMediaFaces({ db, userId, item })) });
    } catch (error) {
      console.error('[people-intelligence] media index failed', item.id, error?.name, error?.message);
      await db.collection('media').updateOne(
        { id: item.id, userId },
        { $set: { 'peopleIntelligence.version': PEOPLE_INTELLIGENCE_VERSION, 'peopleIntelligence.status': 'failed', 'peopleIntelligence.error': error?.name || 'index_failed', 'peopleIntelligence.updatedAt': new Date() } },
      );
      results.push({ mediaId: item.id, status: 'failed', error: error?.name || 'index_failed' });
    }
  }

  const remaining = await db.collection('media').countDocuments({
    userId,
    trashed: { $ne: true },
    kind: 'photo',
    $or: [
      { 'peopleIntelligence.version': { $ne: PEOPLE_INTELLIGENCE_VERSION } },
      { 'peopleIntelligence.status': { $nin: ['completed', 'skipped', 'failed'] } },
    ],
  });

  return {
    processed: results.length,
    completed: results.filter((row) => row.status === 'completed').length,
    skipped: results.filter((row) => row.status === 'skipped').length,
    failed: results.filter((row) => row.status === 'failed').length,
    faces: results.reduce((sum, row) => sum + Number(row.faces || 0), 0),
    remaining,
    results,
  };
}
