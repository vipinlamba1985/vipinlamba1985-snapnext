import { analyzeImage, analyzeVideo } from '@/lib/gemini';
import { storage } from '@/lib/storage';
import { consumeReservation, releaseReservation } from '@/lib/protection-reservations';
import { releaseExternalAiSpend, reserveExternalAiSpend, settleExternalAiSpend } from '@/lib/ai-spend-gate';

const MAX_ANALYSIS_BYTES = 30 * 1024 * 1024;
const IMAGE_ANALYSIS_MAX_COST_USD = Math.max(0.0001, Number(process.env.AI_UPLOAD_IMAGE_MAX_COST_USD || 0.005));
const VIDEO_ANALYSIS_MAX_COST_USD = Math.max(0.0001, Number(process.env.AI_UPLOAD_VIDEO_MAX_COST_USD || 0.03));

export async function getReservedUpload(db, userId, reservationId) {
  return db.collection('upload_reservations').findOne({ id: reservationId, userId, status: 'reserved' });
}

async function analyzeStoredMedia({ db, user, reservation, provider, storageKey }) {
  if ((reservation.bytes || 0) > MAX_ANALYSIS_BYTES) return null;

  const isVideo = reservation.kind === 'video';
  const estimatedCostUsd = isVideo ? VIDEO_ANALYSIS_MAX_COST_USD : IMAGE_ANALYSIS_MAX_COST_USD;
  const feature = isVideo ? 'upload_video_analysis' : 'upload_image_analysis';
  const gate = await reserveExternalAiSpend({
    db,
    user,
    request: null,
    feature,
    agentId: 'organizer-agent',
    estimatedCostUsd,
    essential: false,
    metadata: { source: 'protection-upload', bytes: reservation.bytes || 0 },
  });

  if (!gate.allowed) {
    return null;
  }

  try {
    const buffer = await storage.read({ provider, storageKey });
    const analysis = isVideo
      ? await analyzeVideo({ buffer, name: reservation.name, mimeType: reservation.mime || '' })
      : await analyzeImage({ buffer, mimeType: reservation.mime || '' });

    await settleExternalAiSpend({
      db,
      reservation: gate,
      actualCostUsd: estimatedCostUsd,
      feature,
      agentId: 'organizer-agent',
      userId: user.id,
      provider: 'gemini',
      model: isVideo ? 'gemini-3.5-flash' : 'gemini-3.5-flash',
      metadata: { fileId: reservation.fileId, source: 'protection-upload' },
    });
    return analysis;
  } catch (error) {
    await releaseExternalAiSpend({ db, reservation: gate, reason: error?.code || 'upload_analysis_failed' });
    console.error('[protection] analysis failed', error?.message);
    return null;
  }
}

export async function commitReservedUpload({ db, user, reservation, provider, storageKey }) {
  const duplicate = await db.collection('media').findOne({ userId: user.id, hash: reservation.hash });
  if (duplicate) {
    await releaseReservation(db, reservation.id, 'duplicate');
    return { duplicate: true, item: duplicate };
  }

  const aiAnalysis = await analyzeStoredMedia({ db, user, reservation, provider, storageKey });
  const capturedAt = reservation.captureDate ? new Date(reservation.captureDate) : null;
  const now = new Date();
  const doc = {
    id: reservation.fileId,
    userId: user.id,
    name: reservation.name,
    size: reservation.bytes,
    hash: reservation.hash,
    mime: reservation.mime || '',
    kind: reservation.kind,
    storageKey,
    provider,
    favorite: false,
    trashed: false,
    aiAnalysis,
    memoryPriority: {
      type: reservation.priorityType || 'best_of_life',
      personName: reservation.priorityPersonName || null,
      relationship: reservation.relationship || null,
      score: reservation.priorityScore || 0,
    },
    capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null,
    createdAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : now,
    uploadedAt: now,
    protectionPlanId: reservation.protectionPlanId || null,
  };

  await db.collection('media').insertOne(doc);
  await consumeReservation(db, reservation.id);
  return { duplicate: false, item: doc };
}
