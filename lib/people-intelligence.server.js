import { v4 as uuidv4 } from 'uuid';
import { storage } from '@/lib/storage';
import {
  FACE_AUTO_ASSIGN_THRESHOLD,
  FACE_MATCH_THRESHOLD,
  PEOPLE_INTELLIGENCE_VERSION,
  cleanFaceBox,
  eligibleForPeopleIndex,
  faceQualityScore,
  isUsableFaceBox,
  matchDecision,
  peopleCollectionId,
  rekognitionUserId,
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
  try { await client.send(new CreateCollectionCommand({ CollectionId: collectionId })); }
  catch (error) { if (error?.name !== 'ResourceAlreadyExistsException') throw error; }
  return collectionId;
}

function imageInputFor(item, buffer) {
  if (item.provider === 's3' && item.storageKey && process.env.AWS_S3_BUCKET) {
    return { S3Object: { Bucket: process.env.AWS_S3_BUCKET, Name: item.storageKey } };
  }
  return { Bytes: buffer };
}

async function ensureRekognitionUser(collectionId, clusterId) {
  const client = await getClient();
  const { CreateUserCommand } = await import('@aws-sdk/client-rekognition');
  const awsUserId = rekognitionUserId(clusterId);
  try { await client.send(new CreateUserCommand({ CollectionId: collectionId, UserId: awsUserId })); }
  catch (error) { if (!['ResourceAlreadyExistsException', 'ConflictException'].includes(error?.name)) throw error; }
  return awsUserId;
}

async function associateFace(collectionId, awsUserId, faceId) {
  const client = await getClient();
  const { AssociateFacesCommand } = await import('@aws-sdk/client-rekognition');
  try {
    await client.send(new AssociateFacesCommand({
      CollectionId: collectionId,
      UserId: awsUserId,
      FaceIds: [faceId],
      UserMatchThreshold: Number(process.env.PEOPLE_FACE_MATCH_THRESHOLD || FACE_MATCH_THRESHOLD),
    }));
  } catch (error) {
    if (!['ConflictException', 'ResourceAlreadyExistsException'].includes(error?.name)) throw error;
  }
}

async function findExistingCluster(db, userId, collectionId, faceId) {
  const client = await getClient();
  const { SearchUsersCommand } = await import('@aws-sdk/client-rekognition');
  const result = await client.send(new SearchUsersCommand({
    CollectionId: collectionId,
    FaceId: faceId,
    UserMatchThreshold: Number(process.env.PEOPLE_FACE_MATCH_THRESHOLD || FACE_MATCH_THRESHOLD),
    MaxUsers: 10,
  }));
  const matches = (result.UserMatches || []).sort((a, b) => Number(b.Similarity || 0) - Number(a.Similarity || 0));
  for (const match of matches) {
    const awsUserId = match.User?.UserId;
    if (!awsUserId) continue;
    const cluster = await db.collection('person_clusters').findOne({
      userId,
      indexVersion: PEOPLE_INTELLIGENCE_VERSION,
      rekognitionUserId: awsUserId,
      status: { $ne: 'rejected' },
    });
    if (cluster) {
      const similarity = Number(match.Similarity || 0);
      return { clusterId: cluster.clusterId, rekognitionUserId: awsUserId, similarity, verificationStatus: matchDecision(similarity) };
    }
  }
  return null;
}

async function legacyNameForMedia(db, userId, mediaId) {
  const legacy = await db.collection('person_clusters').findOne({
    userId,
    indexVersion: { $ne: PEOPLE_INTELLIGENCE_VERSION },
    mediaIds: mediaId,
    displayName: { $type: 'string', $nin: ['', 'Add name'] },
    status: { $nin: ['hidden', 'rejected'] },
  }, { sort: { updatedAt: -1 } });
  return legacy?.displayName || null;
}

async function upsertCluster(db, payload) {
  const { userId, clusterId, rekognitionUserId: awsUserId, mediaId, faceId, faceBox, quality, similarity, verificationStatus } = payload;
  const now = new Date();
  const existing = await db.collection('person_clusters').findOne({ userId, clusterId });
  const inheritedName = existing?.displayName || await legacyNameForMedia(db, userId, mediaId);
  await db.collection('person_clusters').updateOne(
    { userId, clusterId },
    {
      $setOnInsert: { userId, clusterId, createdAt: now },
      $set: {
        indexVersion: PEOPLE_INTELLIGENCE_VERSION,
        rekognitionUserId: awsUserId,
        displayName: inheritedName || null,
        status: 'discovered',
        updatedAt: now,
        verificationStatus: verificationStatus || 'suggested',
        bestSimilarity: Math.max(Number(existing?.bestSimilarity || 0), Number(similarity || 0)),
      },
      $addToSet: { mediaIds: mediaId, faceIds: faceId },
    },
    { upsert: true },
  );

  const cluster = await db.collection('person_clusters').findOne({ userId, clusterId });
  if (!cluster?.representativeMediaId || quality > Number(cluster.representativeQuality || 0)) {
    await db.collection('person_clusters').updateOne(
      { userId, clusterId },
      { $set: { representativeMediaId: mediaId, representativeFaceId: faceId, representativeFaceBox: faceBox, representativeQuality: quality, updatedAt: now } },
    );
  }
}

function rejectionSummary(unindexed = [], appRejected = []) {
  const summary = {};
  for (const row of unindexed) {
    const reasons = row.Reasons?.length ? row.Reasons : ['AWS_UNINDEXED'];
    for (const reason of reasons) summary[reason] = Number(summary[reason] || 0) + 1;
  }
  for (const reason of appRejected) summary[reason] = Number(summary[reason] || 0) + 1;
  return summary;
}

export async function indexMediaFaces({ db, userId, item }) {
  const existing = item.peopleIntelligence;
  if (existing?.version === PEOPLE_INTELLIGENCE_VERSION && ['completed', 'skipped', 'no_faces'].includes(existing?.status)) {
    return { status: existing.status, faces: existing.faceIds?.length || 0, clusters: existing.clusterIds || [], diagnostics: existing.diagnostics || null };
  }
  if (!eligibleForPeopleIndex(item)) {
    await db.collection('media').updateOne({ id: item.id, userId }, { $set: { peopleIntelligence: { version: PEOPLE_INTELLIGENCE_VERSION, status: 'skipped', reason: 'not_eligible', indexedAt: new Date(), faceIds: [], clusterIds: [] } } });
    return { status: 'skipped', reason: 'not_eligible', faces: 0, clusters: [] };
  }

  const collectionId = await ensureCollection(userId);
  let buffer = null;
  if (item.provider !== 's3') buffer = await storage.read({ provider: item.provider, storageKey: item.storageKey });
  const client = await getClient();
  const { IndexFacesCommand } = await import('@aws-sdk/client-rekognition');
  const result = await client.send(new IndexFacesCommand({
    CollectionId: collectionId,
    Image: imageInputFor(item, buffer),
    ExternalImageId: String(item.id).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 255),
    DetectionAttributes: ['ALL'],
    MaxFaces: 30,
    QualityFilter: process.env.PEOPLE_AWS_QUALITY_FILTER || 'AUTO',
  }));

  const minimumQuality = Number(process.env.PEOPLE_REPRESENTATIVE_MIN_QUALITY || 10);
  const faceIds = [];
  const clusterIds = [];
  const appRejected = [];
  const indexedRecords = result.FaceRecords || [];
  const unindexedFaces = result.UnindexedFaces || [];

  for (const record of indexedRecords) {
    const faceId = record.Face?.FaceId;
    const faceBox = cleanFaceBox(record.Face?.BoundingBox || record.FaceDetail?.BoundingBox || {});
    const quality = faceQualityScore(record.FaceDetail || {}, record.Face || {});
    if (!faceId) { appRejected.push('MISSING_FACE_ID'); continue; }
    if (!isUsableFaceBox(faceBox)) { appRejected.push('FACE_TOO_SMALL_OR_INVALID'); continue; }
    if (quality < minimumQuality) { appRejected.push('APP_QUALITY_BELOW_MINIMUM'); continue; }

    const matched = await findExistingCluster(db, userId, collectionId, faceId);
    const clusterId = matched?.clusterId || uuidv4();
    const awsUserId = matched?.rekognitionUserId || await ensureRekognitionUser(collectionId, clusterId);
    await associateFace(collectionId, awsUserId, faceId);
    const verificationStatus = matched?.verificationStatus || 'confirmed';

    await db.collection('face_index').updateOne(
      { userId, faceId },
      { $set: {
        userId, faceId, mediaId: item.id, clusterId, rekognitionUserId: awsUserId,
        indexVersion: PEOPLE_INTELLIGENCE_VERSION,
        boundingBox: faceBox, quality,
        confidence: Number(record.Face?.Confidence || record.FaceDetail?.Confidence || 0),
        matchedSimilarity: matched?.similarity || null,
        verificationStatus,
        indexedAt: new Date(),
      } },
      { upsert: true },
    );
    await upsertCluster(db, {
      userId, clusterId, rekognitionUserId: awsUserId, mediaId: item.id, faceId, faceBox, quality,
      similarity: matched?.similarity || FACE_AUTO_ASSIGN_THRESHOLD,
      verificationStatus,
    });
    faceIds.push(faceId);
    if (!clusterIds.includes(clusterId)) clusterIds.push(clusterId);
  }

  const diagnostics = {
    awsIndexed: indexedRecords.length,
    awsUnindexed: unindexedFaces.length,
    accepted: faceIds.length,
    rejected: rejectionSummary(unindexedFaces, appRejected),
  };
  const status = faceIds.length ? 'completed' : 'no_faces';
  await db.collection('media').updateOne(
    { id: item.id, userId },
    { $set: { peopleIntelligence: { version: PEOPLE_INTELLIGENCE_VERSION, status, indexedAt: new Date(), faceIds, clusterIds, diagnostics } } },
  );
  return { status, faces: faceIds.length, clusters: clusterIds, diagnostics };
}

export async function rebuildPeopleIntelligence({ db, userId, limit = 12, retryFailed = false }) {
  if (!peopleIntelligenceReady()) {
    const error = new Error('People Intelligence is not configured for this environment.');
    error.code = 'people_engine_not_configured';
    throw error;
  }
  await ensureCollection(userId);
  const terminalStatuses = retryFailed ? ['completed', 'skipped', 'no_faces'] : ['completed', 'skipped', 'no_faces', 'failed'];
  const candidates = await db.collection('media').find({
    userId,
    trashed: { $ne: true },
    kind: 'photo',
    $or: [
      { 'peopleIntelligence.version': { $ne: PEOPLE_INTELLIGENCE_VERSION } },
      { 'peopleIntelligence.status': { $nin: terminalStatuses } },
      { 'peopleIntelligence.status': 'completed', 'peopleIntelligence.faceIds.0': { $exists: false } },
    ],
  }).sort({ createdAt: 1 }).limit(Math.max(1, Math.min(30, Number(limit || 12)))).toArray();

  const results = [];
  for (const item of candidates) {
    try {
      const forceRetryEmpty = item.peopleIntelligence?.status === 'completed' && !item.peopleIntelligence?.faceIds?.length;
      if (forceRetryEmpty) item.peopleIntelligence = { ...item.peopleIntelligence, status: 'queued' };
      results.push({ mediaId: item.id, ...(await indexMediaFaces({ db, userId, item })) });
    } catch (error) {
      console.error('[people-intelligence-v3] media index failed', item.id, error?.name, error?.message);
      await db.collection('media').updateOne({ id: item.id, userId }, { $set: { 'peopleIntelligence.version': PEOPLE_INTELLIGENCE_VERSION, 'peopleIntelligence.status': 'failed', 'peopleIntelligence.error': error?.name || 'index_failed', 'peopleIntelligence.updatedAt': new Date() } });
      results.push({ mediaId: item.id, status: 'failed', error: error?.name || 'index_failed' });
    }
  }

  const remaining = await db.collection('media').countDocuments({
    userId, trashed: { $ne: true }, kind: 'photo',
    $or: [
      { 'peopleIntelligence.version': { $ne: PEOPLE_INTELLIGENCE_VERSION } },
      { 'peopleIntelligence.status': { $nin: ['completed', 'skipped', 'no_faces', 'failed'] } },
      { 'peopleIntelligence.status': 'completed', 'peopleIntelligence.faceIds.0': { $exists: false } },
    ],
  });
  const diagnostics = results.reduce((summary, row) => {
    summary.awsIndexed += Number(row.diagnostics?.awsIndexed || 0);
    summary.awsUnindexed += Number(row.diagnostics?.awsUnindexed || 0);
    summary.accepted += Number(row.diagnostics?.accepted || 0);
    for (const [reason, count] of Object.entries(row.diagnostics?.rejected || {})) summary.rejected[reason] = Number(summary.rejected[reason] || 0) + Number(count || 0);
    return summary;
  }, { awsIndexed: 0, awsUnindexed: 0, accepted: 0, rejected: {} });
  return {
    version: PEOPLE_INTELLIGENCE_VERSION,
    processed: results.length,
    completed: results.filter((row) => row.status === 'completed').length,
    noFaces: results.filter((row) => row.status === 'no_faces').length,
    skipped: results.filter((row) => row.status === 'skipped').length,
    failed: results.filter((row) => row.status === 'failed').length,
    faces: results.reduce((sum, row) => sum + Number(row.faces || 0), 0),
    diagnostics,
    remaining,
    results,
  };
}
