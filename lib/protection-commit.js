import { analyzeImage, analyzeVideo } from '@/lib/gemini';
import { storage } from '@/lib/storage';
import { consumeReservation, releaseReservation } from '@/lib/protection-reservations';

const MAX_ANALYSIS_BYTES = 30 * 1024 * 1024;

export async function getReservedUpload(db, userId, reservationId) {
  return db.collection('upload_reservations').findOne({ id: reservationId, userId, status: 'reserved' });
}

async function analyzeStoredMedia(reservation, provider, storageKey) {
  if ((reservation.bytes || 0) > MAX_ANALYSIS_BYTES) return null;
  try {
    const buffer = await storage.read({ provider, storageKey });
    if (reservation.kind === 'video') {
      return analyzeVideo({ buffer, name: reservation.name, mimeType: reservation.mime || '' });
    }
    return analyzeImage({ buffer, mimeType: reservation.mime || '' });
  } catch (error) {
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

  const aiAnalysis = await analyzeStoredMedia(reservation, provider, storageKey);
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
