import { v4 as uuidv4 } from 'uuid';
import { storage } from '@/lib/storage';
import { reserveUploadBytes, releaseReservation } from '@/lib/protection-reservations';
import { findProtectedDuplicate, supportedProtectionMime } from '@/lib/protection-usage';
import { SAFE_SERVER_UPLOAD_BYTES } from '@/lib/protection-upload-limits';

export async function preflightProtectionItem({ db, user, plan, usedBytes, item, assignedPeople = [] }) {
  const name = String(item.name || '').slice(0, 240);
  const size = Number(item.size || 0);
  const mime = String(item.mime || '');
  const hash = String(item.hash || '');
  const localId = item.localId;

  if (!name || !size || !hash || !supportedProtectionMime(mime)) {
    return { localId, decision: 'SKIP_UNSUPPORTED' };
  }

  const duplicate = await findProtectedDuplicate(db, user.id, hash);
  if (duplicate) {
    return {
      localId,
      decision: 'SKIP_DUPLICATE',
      existingMediaId: duplicate.id,
      assignmentPending: assignedPeople.length > 0,
    };
  }

  const limitBytes = plan.id === 'super_user' ? Number.MAX_SAFE_INTEGER : plan.storageBytes;
  const reservation = await reserveUploadBytes({
    db,
    userId: user.id,
    planLimitBytes: limitBytes,
    usedBytes,
    bytes: size,
    metadata: {
      localId,
      fileId: uuidv4(),
      name,
      mime,
      hash,
      kind: mime.startsWith('video/') ? 'video' : 'photo',
      captureDate: item.captureDate || null,
      priorityType: item.priorityType || 'best_of_life',
      priorityPersonName: item.priorityPersonName || null,
      relationship: item.relationship || null,
      priorityScore: Number(item.priorityScore || 0),
      assignedPeople: assignedPeople.map((person) => ({
        clusterId: String(person.clusterId || ''),
        displayName: String(person.displayName || 'This person').slice(0, 80),
      })),
    },
  });
  if (!reservation) return { localId, decision: 'SKIP_NO_SPACE' };

  try {
    const serverLimit = Math.min(
      SAFE_SERVER_UPLOAD_BYTES,
      storage.config.maxUploadBytes || Number.MAX_SAFE_INTEGER,
      plan.maxUploadBytes || Number.MAX_SAFE_INTEGER,
    );

    if (storage.active() !== 's3') {
      if (size > serverLimit) {
        await releaseReservation(db, reservation.id, 'too_large', { userId: user.id });
        return { localId, decision: 'SKIP_TOO_LARGE' };
      }
      return { localId, decision: 'ACCEPT', reservationId: reservation.id, uploadMode: 'server' };
    }

    try {
      const signed = await storage.getUploadUrl({ userId: user.id, fileId: reservation.fileId, name, mime });
      await db.collection('upload_reservations').updateOne(
        { id: reservation.id, userId: user.id, status: 'reserved' },
        { $set: { uploadMode: 'direct', storageKey: signed.storageKey, provider: 's3' } },
      );
      return {
        localId,
        decision: 'ACCEPT',
        reservationId: reservation.id,
        uploadMode: 'direct',
        uploadUrl: signed.url,
        storageKey: signed.storageKey,
      };
    } catch (error) {
      if (size > serverLimit) {
        await releaseReservation(db, reservation.id, 'direct_unavailable', { userId: user.id });
        return { localId, decision: 'SKIP_DIRECT_REQUIRED' };
      }
      return { localId, decision: 'ACCEPT', reservationId: reservation.id, uploadMode: 'server' };
    }
  } catch (error) {
    await releaseReservation(db, reservation.id, 'preflight_failed', { userId: user.id }).catch(() => null);
    throw error;
  }
}
