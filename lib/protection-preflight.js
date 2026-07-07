import { v4 as uuidv4 } from 'uuid';
import { storage } from '@/lib/storage';
import { reserveUploadBytes, releaseReservation } from '@/lib/protection-reservations';
import { findProtectedDuplicate, supportedProtectionMime } from '@/lib/protection-usage';

const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
const MULTIPART_PART_SIZE = 16 * 1024 * 1024;

export async function preflightProtectionItem({ db, user, plan, usedBytes, item }) {
  const name = String(item.name || '').slice(0, 240);
  const size = Number(item.size || 0);
  const mime = String(item.mime || '');
  const hash = String(item.hash || '');
  const localId = item.localId;

  if (!name || !size || !hash || !supportedProtectionMime(mime)) return { localId, decision: 'SKIP_UNSUPPORTED' };
  const duplicate = await findProtectedDuplicate(db, user.id, hash);
  if (duplicate) return { localId, decision: 'SKIP_DUPLICATE', existingMediaId: duplicate.id };

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
      personClusterId: item.personClusterId || null,
      selfClusterId: item.selfClusterId || null,
    },
  });
  if (!reservation) return { localId, decision: 'SKIP_NO_SPACE' };

  const serverLimit = Math.min(storage.config.maxUploadBytes || Number.MAX_SAFE_INTEGER, plan.maxUploadBytes || Number.MAX_SAFE_INTEGER);
  if (storage.active() !== 's3' && size > serverLimit) {
    await releaseReservation(db, reservation.id, 'too_large');
    return { localId, decision: 'SKIP_TOO_LARGE' };
  }

  if (storage.active() === 's3' && mime.startsWith('video/') && size >= MULTIPART_THRESHOLD) {
    try {
      const session = await storage.createMultipartUpload({ userId: user.id, fileId: reservation.fileId, name, mime });
      const totalParts = Math.ceil(size / MULTIPART_PART_SIZE);
      await db.collection('upload_reservations').updateOne({ id: reservation.id }, { $set: {
        uploadMode: 'multipart', provider: 's3', storageKey: session.storageKey, multipartUploadId: session.uploadId,
        multipartPartSize: MULTIPART_PART_SIZE, multipartTotalParts: totalParts,
      } });
      return { localId, decision: 'ACCEPT', reservationId: reservation.id, uploadMode: 'multipart', partSize: MULTIPART_PART_SIZE, totalParts };
    } catch {}
  }

  if (storage.active() === 's3') {
    try {
      const signed = await storage.getUploadUrl({ userId: user.id, fileId: reservation.fileId, name, mime });
      await db.collection('upload_reservations').updateOne({ id: reservation.id }, { $set: { uploadMode: 'direct', storageKey: signed.storageKey, provider: 's3' } });
      return { localId, decision: 'ACCEPT', reservationId: reservation.id, uploadMode: 'direct', uploadUrl: signed.url, storageKey: signed.storageKey };
    } catch {}
  }

  return { localId, decision: 'ACCEPT', reservationId: reservation.id, uploadMode: 'server' };
}
