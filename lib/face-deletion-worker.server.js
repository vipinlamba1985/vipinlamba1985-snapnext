import crypto from 'crypto';
import { peopleCollectionId } from '@/lib/people-intelligence';
import { peopleRekognition } from '@/lib/people-rekognition-capabilities.server';
import {
  deleteSnapNextFaceRecognitionState,
  verifySnapNextFaceRecognitionStateDeleted,
} from '@/lib/face-deletion-inventory';

const ACTIVE_STATUSES = Object.freeze(['pending', 'processing', 'verifying']);
const BLOCKING_STATUSES = Object.freeze([...ACTIVE_STATUSES, 'failed']);

function intEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function faceDeletionWorkerConfig() {
  return Object.freeze({
    maxAutomaticAttempts: intEnv('FACE_DELETION_MAX_AUTOMATIC_ATTEMPTS', 5, 1, 20),
    retryBaseMs: intEnv('FACE_DELETION_RETRY_BASE_MS', 5 * 60 * 1000, 10_000, 24 * 60 * 60 * 1000),
    retryMaxMs: intEnv('FACE_DELETION_RETRY_MAX_MS', 6 * 60 * 60 * 1000, 60_000, 7 * 24 * 60 * 60 * 1000),
    leaseMs: intEnv('FACE_DELETION_LEASE_MS', 5 * 60 * 1000, 30_000, 60 * 60 * 1000),
    recoveryBatchSize: intEnv('FACE_DELETION_RECOVERY_BATCH_SIZE', 10, 1, 100),
  });
}

function resultDocument(result) {
  return result?.value || result || null;
}

function isCollectionMissing(error) {
  return error?.name === 'ResourceNotFoundException'
    || error?.Code === 'ResourceNotFoundException'
    || /collection.*not.*exist|resource.*not.*found/i.test(String(error?.message || ''));
}

function retryDelayMs(attempt, config = faceDeletionWorkerConfig()) {
  const exponent = Math.max(0, Number(attempt || 1) - 1);
  return Math.min(config.retryMaxMs, config.retryBaseMs * (2 ** exponent));
}

function cloudConsent(user = {}) {
  return user.cloudFaceRecognitionConsent || user.faceProcessingConsent || {};
}

export function deletionBlocksCloudRegrant(request = null) {
  return Boolean(request && BLOCKING_STATUSES.includes(request.status));
}

export async function createFaceDeletionRequest({ db, userId, reason = 'user_requested' }) {
  const [existing, user] = await Promise.all([
    db.collection('face_deletion_requests').findOne({ userId }),
    db.collection('users').findOne({ id: userId }, {
      projection: { cloudFaceRecognitionConsent: 1, faceProcessingConsent: 1 },
    }),
  ]);

  if (existing && ACTIVE_STATUSES.includes(existing.status)) return { request: existing, created: false, active: true };
  if (existing?.status === 'failed') return { request: existing, created: false, failed: true };

  const consent = cloudConsent(user || {});
  if (consent.granted === true && !consent.revokedAt) {
    const error = new Error('Turn off cloud face recognition before deleting stored recognition data.');
    error.code = 'cloud_face_consent_must_be_revoked';
    throw error;
  }

  if (existing?.status === 'verified_deleted') {
    const verifiedAt = existing.verifiedAt ? new Date(existing.verifiedAt).getTime() : 0;
    const revokedAt = consent.revokedAt ? new Date(consent.revokedAt).getTime() : 0;
    if (!revokedAt || revokedAt <= verifiedAt) return { request: existing, created: false, alreadyVerified: true };
  }

  const now = new Date();
  const generation = Math.max(1, Number(existing?.generation || 0) + 1);
  const request = {
    userId,
    generation,
    status: 'pending',
    stage: 'requested',
    reason,
    requestedAt: now,
    attempts: 0,
    lastError: null,
    lastErrorCode: null,
    nextRetryAt: null,
    workerId: null,
    leaseExpiresAt: null,
    processingStartedAt: null,
    verifiedAt: null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await db.collection('face_deletion_requests').updateOne(
    { userId },
    { $set: request },
    { upsert: true },
  );
  await db.collection('users').updateOne(
    { id: userId },
    {
      $set: {
        'cloudFaceRecognitionConsent.deletionState': 'pending',
        'cloudFaceRecognitionConsent.deletionRequestedAt': now,
        'faceProcessingConsent.deletionState': 'pending',
        'faceProcessingConsent.deletionRequestedAt': now,
      },
    },
  );

  return { request, created: true };
}

export async function requeueFailedFaceDeletion({ db, userId }) {
  const now = new Date();
  return resultDocument(await db.collection('face_deletion_requests').findOneAndUpdate(
    { userId, status: 'failed' },
    {
      $set: {
        status: 'pending',
        stage: 'retry_requested',
        nextRetryAt: null,
        workerId: null,
        leaseExpiresAt: null,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  ));
}

async function deleteRekognitionCollection(collectionId) {
  try {
    await peopleRekognition.deleteCollection({ CollectionId: collectionId });
    return { alreadyAbsent: false };
  } catch (error) {
    if (isCollectionMissing(error)) return { alreadyAbsent: true };
    throw error;
  }
}

async function verifyRekognitionCollectionAbsent(collectionId) {
  try {
    await peopleRekognition.describeCollection({ CollectionId: collectionId });
    return { ok: false, reason: 'collection_still_exists' };
  } catch (error) {
    if (isCollectionMissing(error)) return { ok: true };
    throw error;
  }
}

async function ownedUpdate(db, { userId, generation, workerId, filter = {}, set = {}, unset = {} }) {
  const update = { $set: { ...set, updatedAt: new Date() } };
  if (Object.keys(unset).length) update.$unset = unset;
  const result = await db.collection('face_deletion_requests').updateOne(
    { userId, generation, workerId, ...filter },
    update,
  );
  if (result.matchedCount !== 1) {
    const error = new Error('Face deletion worker lost generation ownership.');
    error.code = 'face_deletion_stale_worker';
    throw error;
  }
}

export async function processFaceDeletionGeneration({ db, userId, generation, workerId = crypto.randomUUID() }) {
  const config = faceDeletionWorkerConfig();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + config.leaseMs);
  const claimed = resultDocument(await db.collection('face_deletion_requests').findOneAndUpdate(
    { userId, generation, status: 'pending' },
    {
      $set: {
        status: 'processing',
        stage: 'deleting_cloud',
        workerId,
        processingStartedAt: now,
        leaseExpiresAt,
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after' },
  ));
  if (!claimed) return { ok: false, claimed: false, reason: 'not_pending_or_stale' };

  const collectionId = peopleCollectionId(userId);
  try {
    await deleteRekognitionCollection(collectionId);
    await ownedUpdate(db, {
      userId, generation, workerId,
      filter: { status: 'processing' },
      set: { stage: 'cloud_deleted', leaseExpiresAt: new Date(Date.now() + config.leaseMs) },
    });

    await deleteSnapNextFaceRecognitionState({ db, userId });
    await ownedUpdate(db, {
      userId, generation, workerId,
      filter: { status: 'processing' },
      set: { stage: 'deleting_snapnext_records', leaseExpiresAt: new Date(Date.now() + config.leaseMs) },
    });

    await ownedUpdate(db, {
      userId, generation, workerId,
      filter: { status: 'processing' },
      set: { status: 'verifying', stage: 'verifying', leaseExpiresAt: new Date(Date.now() + config.leaseMs) },
    });

    const [awsVerification, snapNextVerification] = await Promise.all([
      verifyRekognitionCollectionAbsent(collectionId),
      verifySnapNextFaceRecognitionStateDeleted({ db, userId }),
    ]);
    if (!awsVerification.ok || !snapNextVerification.ok) {
      const error = new Error('Face recognition deletion could not be verified across every required store.');
      error.code = 'face_deletion_verification_incomplete';
      error.verification = { aws: awsVerification, snapNext: snapNextVerification };
      throw error;
    }

    const verifiedAt = new Date();
    const completed = await db.collection('face_deletion_requests').updateOne(
      { userId, generation, workerId, status: 'verifying' },
      {
        $set: {
          status: 'verified_deleted',
          stage: 'verified_deleted',
          verifiedAt,
          lastError: null,
          lastErrorCode: null,
          nextRetryAt: null,
          updatedAt: verifiedAt,
        },
        $unset: { workerId: '', leaseExpiresAt: '' },
      },
    );
    if (completed.matchedCount !== 1) {
      const error = new Error('Face deletion verification completed on a stale generation.');
      error.code = 'face_deletion_stale_worker';
      throw error;
    }

    await db.collection('users').updateOne(
      { id: userId },
      {
        $set: {
          'cloudFaceRecognitionConsent.granted': false,
          'cloudFaceRecognitionConsent.deletionState': 'verified_deleted',
          'cloudFaceRecognitionConsent.deletionVerifiedAt': verifiedAt,
          'faceProcessingConsent.granted': false,
          'faceProcessingConsent.deletionState': 'verified_deleted',
          'faceProcessingConsent.deletionVerifiedAt': verifiedAt,
        },
      },
    );

    return { ok: true, claimed: true, generation, verifiedAt, verification: { aws: awsVerification, snapNext: snapNextVerification } };
  } catch (error) {
    if (error?.code === 'face_deletion_stale_worker') return { ok: false, claimed: true, stale: true, generation };
    const attempts = Number(claimed.attempts || 1);
    const failedAt = new Date();
    const nextRetryAt = new Date(failedAt.getTime() + retryDelayMs(attempts, config));
    await db.collection('face_deletion_requests').updateOne(
      { userId, generation, workerId, status: { $in: ['processing', 'verifying'] } },
      {
        $set: {
          status: 'failed',
          stage: 'failed',
          lastError: String(error?.message || 'Face deletion failed.').slice(0, 500),
          lastErrorCode: String(error?.code || error?.name || 'face_deletion_failed').slice(0, 120),
          nextRetryAt,
          failedAt,
          updatedAt: failedAt,
        },
        $unset: { workerId: '', leaseExpiresAt: '' },
      },
    );
    await db.collection('users').updateOne(
      { id: userId },
      {
        $set: {
          'cloudFaceRecognitionConsent.granted': false,
          'cloudFaceRecognitionConsent.deletionState': 'failed',
          'faceProcessingConsent.granted': false,
          'faceProcessingConsent.deletionState': 'failed',
        },
      },
    );
    return { ok: false, claimed: true, generation, failed: true, error: error?.code || error?.name || 'face_deletion_failed' };
  }
}

export async function processFaceDeletionForUser({ db, userId }) {
  const request = await db.collection('face_deletion_requests').findOne({ userId });
  if (!request) return { ok: false, claimed: false, reason: 'no_request' };
  if (request.status === 'failed') {
    const requeued = await requeueFailedFaceDeletion({ db, userId });
    if (!requeued) return { ok: false, claimed: false, reason: 'retry_race' };
    return processFaceDeletionGeneration({ db, userId, generation: requeued.generation });
  }
  return processFaceDeletionGeneration({ db, userId, generation: request.generation });
}

export async function recoverFaceDeletionRequests({ db, now = new Date() }) {
  const config = faceDeletionWorkerConfig();
  await db.collection('face_deletion_requests').updateMany(
    {
      status: { $in: ['processing', 'verifying'] },
      leaseExpiresAt: { $lte: now },
    },
    {
      $set: {
        status: 'pending',
        stage: 'lease_recovery',
        lastErrorCode: 'face_deletion_lease_expired',
        updatedAt: now,
      },
      $unset: { workerId: '', leaseExpiresAt: '' },
    },
  );

  const candidates = await db.collection('face_deletion_requests').find({
    $or: [
      { status: 'pending' },
      {
        status: 'failed',
        attempts: { $lt: config.maxAutomaticAttempts },
        $or: [
          { nextRetryAt: { $exists: false } },
          { nextRetryAt: null },
          { nextRetryAt: { $lte: now } },
        ],
      },
    ],
  }).sort({ requestedAt: 1 }).limit(config.recoveryBatchSize).toArray();

  const results = [];
  for (const candidate of candidates) {
    let request = candidate;
    if (candidate.status === 'failed') {
      request = await requeueFailedFaceDeletion({ db, userId: candidate.userId });
      if (!request) continue;
    }
    results.push(await processFaceDeletionGeneration({
      db,
      userId: request.userId,
      generation: request.generation,
    }));
  }
  return { scanned: candidates.length, results };
}
