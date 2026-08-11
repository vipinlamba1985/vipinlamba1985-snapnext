import { consumeReservation, releaseReservation } from '@/lib/protection-reservations';

export async function getReservedUpload(db, userId, reservationId) {
  return db.collection('upload_reservations').findOne({ id: reservationId, userId, status: 'reserved' });
}

function confirmedPeopleFromReservation(reservation, assignedAt) {
  if (!Array.isArray(reservation.assignedPeople)) return [];
  const seen = new Set();
  return reservation.assignedPeople.flatMap((entry) => {
    const clusterId = String(entry?.clusterId || '').trim();
    if (!clusterId || seen.has(clusterId)) return [];
    seen.add(clusterId);
    return [{
      clusterId,
      displayName: String(entry?.displayName || 'This person').trim().slice(0, 80) || 'This person',
      assignedAt,
      source: 'upload_assignment',
    }];
  });
}

export async function commitReservedUpload({ db, user, reservation, provider, storageKey }) {
  const duplicate = await db.collection('media').findOne({ userId: user.id, hash: reservation.hash });
  if (duplicate) {
    await releaseReservation(db, reservation.id, 'duplicate');
    return { duplicate: true, item: duplicate };
  }

  // M2 privacy/cost boundary: ordinary backup commits never call Gemini,
  // Rekognition, or any other cloud-vision provider. Optional local MediaPipe
  // analysis is produced separately after explicit local consent, and any
  // future cloud analysis must have its own explicit user-triggered workflow.
  const capturedAt = reservation.captureDate ? new Date(reservation.captureDate) : null;
  const now = new Date();
  const userConfirmedPeople = confirmedPeopleFromReservation(reservation, now);
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
    // Keep the legacy field shape stable without performing automatic cloud AI.
    aiAnalysis: null,
    userConfirmedPeople,
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
