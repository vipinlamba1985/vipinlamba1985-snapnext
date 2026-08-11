import { storage } from '@/lib/storage';
import { evaluateFaceGate } from '@/lib/intelligence/face-gate';
import { intelligenceConfig } from '@/lib/intelligence/config';
import {
  FACE_MATCH_THRESHOLD,
  PEOPLE_INTELLIGENCE_VERSION,
  cleanFaceBox,
  eligibleForPeopleIndex,
  faceQualityScore,
  isUsableFaceBox,
  matchDecision,
  rekognitionUserId,
} from '@/lib/people-intelligence';
import { isLargeGroupPhoto } from '@/lib/people-gallery-rules';
import {
  FAVORITE_PEOPLE_RECOGNITION_VERSION,
  favoriteGeneration,
  favoritePeopleCollectionId,
  normalizeFavoritePeople,
} from '@/lib/favorite-people';
import { peopleRekognition } from '@/lib/people-rekognition-capabilities.server';

export const FAVORITE_RECOGNITION_SCOPE = 'favorite_people';
export const FAVORITE_TERMINAL_STATUSES = Object.freeze(['completed', 'skipped', 'no_faces', 'group_photo', 'no_favorite_match']);

const STABLE_ACROSS_FAVORITES = new Set(['skipped', 'no_faces', 'group_photo']);
const FAVORITE_DEFERRED_STATUSES = new Set([
  'awaiting_analysis',
  'awaiting_consent',
  'awaiting_favorites',
  'awaiting_favorite_enrollment',
  'face_gate_disabled',
  'face_processing_disabled',
]);

function isMissingResource(error) {
  return error?.name === 'ResourceNotFoundException'
    || error?.Code === 'ResourceNotFoundException'
    || /resource.*not.*found|does not exist/i.test(String(error?.message || ''));
}

function imageInputFor(item, buffer) {
  if (item.provider === 's3' && item.storageKey && process.env.AWS_S3_BUCKET) {
    return { S3Object: { Bucket: process.env.AWS_S3_BUCKET, Name: item.storageKey } };
  }
  return { Bytes: buffer };
}

async function imageInput(item) {
  if (item.provider === 's3' && item.storageKey && process.env.AWS_S3_BUCKET) return imageInputFor(item, null);
  const buffer = await storage.read({ provider: item.provider, storageKey: item.storageKey });
  return imageInputFor(item, buffer);
}

export function favoritePeopleEngineReady() {
  return Boolean(process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

async function ensureCollection(userId) {
  const collectionId = favoritePeopleCollectionId(userId);
  try {
    await peopleRekognition.createCollection({ CollectionId: collectionId });
  } catch (error) {
    if (error?.name !== 'ResourceAlreadyExistsException') throw error;
  }
  return collectionId;
}

async function ensureAwsUser(collectionId, clusterId) {
  const awsUserId = rekognitionUserId(clusterId);
  try {
    await peopleRekognition.createUser({ CollectionId: collectionId, UserId: awsUserId });
  } catch (error) {
    if (!['ResourceAlreadyExistsException', 'ConflictException'].includes(error?.name)) throw error;
  }
  return awsUserId;
}

async function deleteFaces(collectionId, faceIds = []) {
  const ids = [...new Set((Array.isArray(faceIds) ? faceIds : []).filter(Boolean))];
  if (!ids.length) return 0;
  try {
    await peopleRekognition.deleteFaces({ CollectionId: collectionId, FaceIds: ids });
  } catch (error) {
    if (!isMissingResource(error)) throw error;
  }
  return ids.length;
}

async function localFaceGateForMedia({ db, userId, item }) {
  const [analysis, user] = await Promise.all([
    db.collection('media_analysis').findOne({ userId, mediaId: item.id }),
    db.collection('users').findOne({ id: userId }, { projection: { cloudFaceRecognitionConsent: 1, faceProcessingConsent: 1 } }),
  ]);
  return evaluateFaceGate({ analysis, user });
}

async function loadFavoriteState(db, userId) {
  const activation = await db.collection('magic_library_activation').findOne({ userId });
  const selected = normalizeFavoritePeople(activation?.recognitionFavorites || []);
  const generation = favoriteGeneration(activation || {});
  const enrollments = selected.length
    ? await db.collection('favorite_people_recognition').find({
      userId,
      clusterId: { $in: selected },
      version: FAVORITE_PEOPLE_RECOGNITION_VERSION,
      faceIds: { $exists: true, $ne: [] },
    }).toArray()
    : [];
  const byAwsUser = new Map();
  for (const enrollment of enrollments) {
    if (selected.includes(String(enrollment.clusterId || '')) && enrollment.awsUserId) {
      byAwsUser.set(String(enrollment.awsUserId), enrollment);
    }
  }
  return { activation, selected, generation, enrollments, byAwsUser };
}

async function persistGateOutcome({ db, userId, item, gate, generation = 0 }) {
  const now = new Date();
  const peopleIntelligence = {
    version: PEOPLE_INTELLIGENCE_VERSION,
    recognitionScope: FAVORITE_RECOGNITION_SCOPE,
    favoriteRecognitionVersion: FAVORITE_PEOPLE_RECOGNITION_VERSION,
    favoriteGeneration: generation,
    status: gate.status,
    reason: gate.reason,
    gateSource: 'media_analysis',
    gateCheckedAt: now,
    faceIds: [],
    clusterIds: [],
  };
  if (Number.isFinite(Number(gate.faceCount))) peopleIntelligence.detectedFaceCount = Number(gate.faceCount);
  if (gate.terminal) peopleIntelligence.indexedAt = now;
  await db.collection('media').updateOne({ id: item.id, userId }, { $set: { peopleIntelligence } });
  return {
    status: gate.status,
    reason: gate.reason,
    faces: 0,
    clusters: [],
    detectedFaceCount: gate.faceCount,
    deferred: Boolean(gate.deferred),
    diagnostics: { gateSource: 'media_analysis', localFaceCount: gate.faceCount, awsIndexed: 0, awsSearched: 0, temporaryCloudFacesDeleted: 0, accepted: 0, rejected: {} },
  };
}

async function persistFavoriteWait({ db, userId, item, generation, status, reason, faceCount }) {
  const now = new Date();
  const peopleIntelligence = {
    version: PEOPLE_INTELLIGENCE_VERSION,
    recognitionScope: FAVORITE_RECOGNITION_SCOPE,
    favoriteRecognitionVersion: FAVORITE_PEOPLE_RECOGNITION_VERSION,
    favoriteGeneration: generation,
    status,
    reason,
    gateSource: 'media_analysis',
    gateCheckedAt: now,
    faceIds: [],
    clusterIds: [],
    detectedFaceCount: faceCount,
  };
  await db.collection('media').updateOne({ id: item.id, userId }, { $set: { peopleIntelligence } });
  return {
    status,
    reason,
    faces: 0,
    clusters: [],
    detectedFaceCount: faceCount,
    deferred: true,
    diagnostics: { gateSource: 'media_analysis', localFaceCount: faceCount, awsIndexed: 0, awsSearched: 0, temporaryCloudFacesDeleted: 0, accepted: 0, rejected: {} },
  };
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

export async function enrollFavoritePerson({ db, userId, clusterId, mediaId }) {
  const existing = await db.collection('favorite_people_recognition').findOne({
    userId,
    clusterId,
    version: FAVORITE_PEOPLE_RECOGNITION_VERSION,
  });
  if (existing?.awsUserId && Array.isArray(existing.faceIds) && existing.faceIds.length) return existing;

  const item = await db.collection('media').findOne({ userId, id: mediaId, trashed: { $ne: true } });
  if (!item || !eligibleForPeopleIndex(item)) {
    const error = new Error('Choose an owned photo for Favourite People enrolment.');
    error.code = 'favorite_reference_invalid';
    throw error;
  }
  const gate = await localFaceGateForMedia({ db, userId, item });
  if (!gate.eligible || Number(gate.faceCount) !== 1) {
    const error = new Error('Choose a clear solo photo containing exactly one face.');
    error.code = gate.status === 'awaiting_consent' ? 'face_processing_consent_required' : 'favorite_reference_must_be_solo';
    throw error;
  }
  if (!favoritePeopleEngineReady()) {
    const error = new Error('Favourite People recognition is not configured for this environment.');
    error.code = 'people_engine_not_configured';
    throw error;
  }

  const collectionId = await ensureCollection(userId);
  const result = await peopleRekognition.indexFaces({
    CollectionId: collectionId,
    Image: await imageInput(item),
    ExternalImageId: `favorite_${String(clusterId).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 200)}`,
    DetectionAttributes: ['ALL'],
    MaxFaces: 1,
    QualityFilter: process.env.PEOPLE_AWS_QUALITY_FILTER || 'AUTO',
  });
  const records = result.FaceRecords || [];
  const allFaceIds = records.map((record) => record.Face?.FaceId).filter(Boolean);
  const record = records[0];
  const faceId = record?.Face?.FaceId;
  const faceBox = cleanFaceBox(record?.Face?.BoundingBox || record?.FaceDetail?.BoundingBox || {});
  const quality = faceQualityScore(record?.FaceDetail || {}, record?.Face || {});
  if (!faceId || records.length !== 1 || !isUsableFaceBox(faceBox)) {
    await deleteFaces(collectionId, allFaceIds);
    const error = new Error('SnapNext could not isolate one usable face in that photo.');
    error.code = 'favorite_reference_face_unusable';
    throw error;
  }

  const awsUserId = await ensureAwsUser(collectionId, clusterId);
  try {
    await peopleRekognition.associateFaces({
      CollectionId: collectionId,
      UserId: awsUserId,
      FaceIds: [faceId],
      UserMatchThreshold: Number(process.env.PEOPLE_FACE_MATCH_THRESHOLD || FACE_MATCH_THRESHOLD),
    });
  } catch (error) {
    await peopleRekognition.deleteUser({ CollectionId: collectionId, UserId: awsUserId }).catch(() => null);
    await deleteFaces(collectionId, allFaceIds);
    throw error;
  }

  const now = new Date();
  const enrollment = {
    userId,
    clusterId,
    version: FAVORITE_PEOPLE_RECOGNITION_VERSION,
    collectionId,
    awsUserId,
    faceIds: [faceId],
    referenceMediaId: item.id,
    referenceFaceBox: faceBox,
    referenceQuality: quality,
    enrolledAt: now,
    updatedAt: now,
  };
  await db.collection('favorite_people_recognition').updateOne(
    { userId, clusterId },
    { $set: enrollment, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );
  await db.collection('person_clusters').updateOne(
    { userId, clusterId },
    {
      $set: {
        indexVersion: PEOPLE_INTELLIGENCE_VERSION,
        identityState: 'person',
        verificationStatus: 'confirmed',
        status: 'active',
        rekognitionUserId: awsUserId,
        representativeMediaId: item.id,
        representativeFaceId: faceId,
        representativeFaceBox: faceBox,
        representativeQuality: quality,
        favoriteRecognition: { version: FAVORITE_PEOPLE_RECOGNITION_VERSION, enrolled: true, enrolledAt: now },
        updatedAt: now,
      },
      $addToSet: { mediaIds: item.id },
    },
    { upsert: true },
  );
  return enrollment;
}

export async function removeFavoriteEnrollment({ db, userId, clusterId }) {
  const enrollment = await db.collection('favorite_people_recognition').findOne({ userId, clusterId });
  if (!enrollment) return { removed: false, idempotent: true };
  const collectionId = favoritePeopleCollectionId(userId);
  if (enrollment.awsUserId) {
    try {
      await peopleRekognition.deleteUser({ CollectionId: collectionId, UserId: enrollment.awsUserId });
    } catch (error) {
      if (!isMissingResource(error)) throw error;
    }
  }
  await deleteFaces(collectionId, enrollment.faceIds || []);
  await db.collection('favorite_people_recognition').deleteOne({ userId, clusterId });
  await db.collection('person_clusters').updateOne(
    { userId, clusterId },
    { $unset: { favoriteRecognition: '' }, $set: { updatedAt: new Date() } },
  );
  return { removed: true };
}

async function clearRemovedFavoriteMatches({ db, userId, clusterId, generation }) {
  const rows = await db.collection('media').find({
    userId,
    'peopleIntelligence.recognitionScope': FAVORITE_RECOGNITION_SCOPE,
    'peopleIntelligence.clusterIds': clusterId,
  }).project({ id: 1, peopleIntelligence: 1 }).toArray();
  for (const row of rows) {
    const nextClusters = (row.peopleIntelligence?.clusterIds || []).filter((value) => value !== clusterId);
    await db.collection('media').updateOne(
      { userId, id: row.id },
      { $set: {
        'peopleIntelligence.clusterIds': nextClusters,
        'peopleIntelligence.status': nextClusters.length ? 'completed' : 'no_favorite_match',
        'peopleIntelligence.favoriteGeneration': generation,
        'peopleIntelligence.updatedAt': new Date(),
      } },
    );
  }
}

export async function finalizeFavoriteRemoval({ db, userId, clusterId, generation }) {
  await clearRemovedFavoriteMatches({ db, userId, clusterId, generation });
}

export async function indexFavoriteMediaFaces({ db, userId, item }) {
  const existing = item.peopleIntelligence || {};
  const favoriteState = await loadFavoriteState(db, userId);
  const sameGeneration = Number(existing.favoriteGeneration || 0) === favoriteState.generation;
  if (existing.recognitionScope === FAVORITE_RECOGNITION_SCOPE
    && FAVORITE_TERMINAL_STATUSES.includes(existing.status)
    && (sameGeneration || STABLE_ACROSS_FAVORITES.has(existing.status))) {
    return { status: existing.status, faces: 0, clusters: existing.clusterIds || [], diagnostics: existing.diagnostics || null };
  }
  if (!eligibleForPeopleIndex(item)) {
    return persistGateOutcome({
      db, userId, item, generation: favoriteState.generation,
      gate: { terminal: true, deferred: false, status: 'skipped', reason: 'not_eligible', faceCount: null },
    });
  }

  // Privacy/cost boundary: trusted local analysis and cloud consent are checked
  // before any collection access, image read, or Rekognition request.
  const gate = await localFaceGateForMedia({ db, userId, item });
  if (!gate.eligible) return persistGateOutcome({ db, userId, item, gate, generation: favoriteState.generation });
  if (!favoriteState.selected.length) {
    return persistFavoriteWait({
      db, userId, item, generation: favoriteState.generation,
      status: 'awaiting_favorites', reason: 'favorite_people_required', faceCount: gate.faceCount,
    });
  }
  if (!favoriteState.byAwsUser.size) {
    return persistFavoriteWait({
      db, userId, item, generation: favoriteState.generation,
      status: 'awaiting_favorite_enrollment', reason: 'favorite_reference_required', faceCount: gate.faceCount,
    });
  }
  if (!favoritePeopleEngineReady()) {
    const error = new Error('Favourite People recognition is not configured for this environment.');
    error.code = 'people_engine_not_configured';
    throw error;
  }

  const collectionId = await ensureCollection(userId);
  const config = intelligenceConfig();
  const result = await peopleRekognition.indexFaces({
    CollectionId: collectionId,
    Image: await imageInput(item),
    ExternalImageId: `scan_${String(item.id).replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 220)}`,
    DetectionAttributes: ['ALL'],
    MaxFaces: config.maxIndexedFacesPerPhoto,
    QualityFilter: process.env.PEOPLE_AWS_QUALITY_FILTER || 'AUTO',
  });

  const indexedRecords = result.FaceRecords || [];
  const unindexedFaces = result.UnindexedFaces || [];
  const allTemporaryFaceIds = indexedRecords.map((record) => record.Face?.FaceId).filter(Boolean);
  const appRejected = [];
  const minimumQuality = Number(process.env.PEOPLE_REPRESENTATIVE_MIN_QUALITY || 10);
  const usableFaces = [];
  for (const record of indexedRecords) {
    const faceId = record.Face?.FaceId;
    const faceBox = cleanFaceBox(record.Face?.BoundingBox || record.FaceDetail?.BoundingBox || {});
    const quality = faceQualityScore(record.FaceDetail || {}, record.Face || {});
    if (!faceId) { appRejected.push('MISSING_FACE_ID'); continue; }
    if (!isUsableFaceBox(faceBox)) { appRejected.push('FACE_TOO_SMALL_OR_INVALID'); continue; }
    if (quality < minimumQuality) { appRejected.push('APP_QUALITY_BELOW_MINIMUM'); continue; }
    usableFaces.push({ faceId, faceBox, quality });
  }

  if (isLargeGroupPhoto(usableFaces.length)) {
    const deleted = await deleteFaces(collectionId, allTemporaryFaceIds);
    const diagnostics = {
      gateSource: 'media_analysis', localFaceCount: gate.faceCount,
      awsIndexed: indexedRecords.length, awsUnindexed: unindexedFaces.length, awsSearched: 0,
      temporaryCloudFacesDeleted: deleted, accepted: 0,
      rejected: rejectionSummary(unindexedFaces, [...appRejected, ...usableFaces.map(() => 'LARGE_GROUP_PHOTO_EXCLUDED')]),
    };
    await db.collection('media').updateOne({ userId, id: item.id }, { $set: { peopleIntelligence: {
      version: PEOPLE_INTELLIGENCE_VERSION,
      recognitionScope: FAVORITE_RECOGNITION_SCOPE,
      favoriteRecognitionVersion: FAVORITE_PEOPLE_RECOGNITION_VERSION,
      favoriteGeneration: favoriteState.generation,
      status: 'group_photo', reason: 'large_group_photo', indexedAt: new Date(),
      faceIds: [], clusterIds: [], detectedFaceCount: usableFaces.length, diagnostics,
    } } });
    return { status: 'group_photo', reason: 'large_group_photo', faces: 0, clusters: [], diagnostics };
  }

  const clusterIds = [];
  let searched = 0;
  try {
    for (const face of usableFaces) {
      const search = await peopleRekognition.searchUsers({
        CollectionId: collectionId,
        FaceId: face.faceId,
        UserMatchThreshold: Number(process.env.PEOPLE_FACE_MATCH_THRESHOLD || FACE_MATCH_THRESHOLD),
        MaxUsers: 10,
      });
      searched += 1;
      const matches = (search.UserMatches || []).sort((a, b) => Number(b.Similarity || 0) - Number(a.Similarity || 0));
      const match = matches.find((candidate) => favoriteState.byAwsUser.has(String(candidate.User?.UserId || '')));
      if (!match) { appRejected.push('NOT_SELECTED_FAVORITE'); continue; }
      const enrollment = favoriteState.byAwsUser.get(String(match.User?.UserId));
      const clusterId = String(enrollment.clusterId);
      const similarity = Number(match.Similarity || 0);
      if (!clusterIds.includes(clusterId)) clusterIds.push(clusterId);
      await db.collection('person_clusters').updateOne(
        { userId, clusterId },
        {
          $set: { updatedAt: new Date(), 'favoriteRecognition.lastMatchedAt': new Date() },
          $max: { bestSimilarity: similarity },
          $addToSet: { mediaIds: item.id },
        },
      );
    }
  } finally {
    // Ordinary-photo face vectors are temporary. The Favourite collection keeps
    // only enrolment vectors chosen by the user, never one vector per photo.
    await deleteFaces(collectionId, allTemporaryFaceIds);
  }

  const diagnostics = {
    gateSource: 'media_analysis', localFaceCount: gate.faceCount,
    awsIndexed: indexedRecords.length, awsUnindexed: unindexedFaces.length, awsSearched: searched,
    temporaryCloudFacesDeleted: allTemporaryFaceIds.length,
    accepted: clusterIds.length,
    retainedCloudFaceVectorsForMedia: 0,
    rejected: rejectionSummary(unindexedFaces, appRejected),
  };
  const status = clusterIds.length ? 'completed' : 'no_favorite_match';
  await db.collection('media').updateOne({ userId, id: item.id }, { $set: { peopleIntelligence: {
    version: PEOPLE_INTELLIGENCE_VERSION,
    recognitionScope: FAVORITE_RECOGNITION_SCOPE,
    favoriteRecognitionVersion: FAVORITE_PEOPLE_RECOGNITION_VERSION,
    favoriteGeneration: favoriteState.generation,
    status,
    reason: clusterIds.length ? 'selected_favorite_match' : 'no_selected_favorite_match',
    indexedAt: new Date(),
    faceIds: [],
    clusterIds,
    detectedFaceCount: gate.faceCount,
    diagnostics,
  } } });
  return { status, faces: 0, clusters: clusterIds, diagnostics };
}

function candidateQuery(userId, generation, retryFailed) {
  const excluded = retryFailed ? FAVORITE_TERMINAL_STATUSES : [...FAVORITE_TERMINAL_STATUSES, 'failed'];
  return {
    userId,
    trashed: { $ne: true },
    kind: 'photo',
    $or: [
      { 'peopleIntelligence.recognitionScope': { $ne: FAVORITE_RECOGNITION_SCOPE } },
      { 'peopleIntelligence.status': { $nin: excluded } },
      {
        'peopleIntelligence.status': { $in: ['completed', 'no_favorite_match'] },
        'peopleIntelligence.favoriteGeneration': { $ne: generation },
      },
    ],
  };
}

export async function rebuildFavoritePeopleRecognition({ db, userId, limit = 12, retryFailed = false }) {
  const state = await loadFavoriteState(db, userId);
  const candidates = await db.collection('media').find(candidateQuery(userId, state.generation, retryFailed))
    .sort({ createdAt: 1 })
    .limit(Math.max(1, Math.min(30, Number(limit || 12))))
    .toArray();
  const results = [];
  for (const item of candidates) {
    try {
      results.push({ mediaId: item.id, ...(await indexFavoriteMediaFaces({ db, userId, item })) });
    } catch (error) {
      console.error('[favorite-people] media match failed', item.id, error?.name, error?.message);
      await db.collection('media').updateOne(
        { userId, id: item.id },
        { $set: {
          'peopleIntelligence.version': PEOPLE_INTELLIGENCE_VERSION,
          'peopleIntelligence.recognitionScope': FAVORITE_RECOGNITION_SCOPE,
          'peopleIntelligence.favoriteGeneration': state.generation,
          'peopleIntelligence.status': 'failed',
          'peopleIntelligence.error': error?.name || 'favorite_match_failed',
          'peopleIntelligence.updatedAt': new Date(),
        } },
      );
      results.push({ mediaId: item.id, status: 'failed', error: error?.name || 'favorite_match_failed' });
    }
  }
  const remaining = await db.collection('media').countDocuments(candidateQuery(userId, state.generation, false));
  const deferred = results.filter((row) => row.deferred || FAVORITE_DEFERRED_STATUSES.has(row.status));
  return {
    version: PEOPLE_INTELLIGENCE_VERSION,
    recognitionMode: FAVORITE_RECOGNITION_SCOPE,
    favoriteRecognitionVersion: FAVORITE_PEOPLE_RECOGNITION_VERSION,
    favoriteGeneration: state.generation,
    selectedFavorites: state.selected.length,
    enrolledFavorites: state.enrollments.length,
    processed: results.length - deferred.length,
    deferred: deferred.length,
    completed: results.filter((row) => row.status === 'completed').length,
    noFavoriteMatch: results.filter((row) => row.status === 'no_favorite_match').length,
    groupPhotos: results.filter((row) => row.status === 'group_photo').length,
    failed: results.filter((row) => row.status === 'failed').length,
    remaining,
    results,
  };
}
