import { v4 as uuidv4 } from 'uuid';

const RESERVATION_TTL_MS = 60 * 60 * 1000;

export async function cleanupExpiredReservations(db, userId) {
  const now = new Date();
  const expired = await db.collection('upload_reservations').find({ userId, status: 'reserved', expiresAt: { $lte: now } }).toArray();
  if (!expired.length) return 0;
  const bytes = expired.reduce((sum, row) => sum + (row.bytes || 0), 0);
  await db.collection('upload_reservations').updateMany({ id: { $in: expired.map((row) => row.id) }, status: 'reserved' }, { $set: { status: 'expired', releasedAt: now } });
  await db.collection('upload_quota_ledgers').updateOne({ userId }, { $inc: { reservedBytes: -bytes }, $set: { updatedAt: now } });
  return bytes;
}

export async function reserveUploadBytes({ db, userId, planLimitBytes, usedBytes, bytes, metadata }) {
  const now = new Date();
  await cleanupExpiredReservations(db, userId);
  await db.collection('upload_quota_ledgers').updateOne(
    { userId },
    { $setOnInsert: { userId, reservedBytes: 0, createdAt: now }, $set: { updatedAt: now } },
    { upsert: true }
  );

  const maxReserved = Math.max(0, planLimitBytes - usedBytes - bytes);
  const ledger = await db.collection('upload_quota_ledgers').findOneAndUpdate(
    { userId, reservedBytes: { $lte: maxReserved } },
    { $inc: { reservedBytes: bytes }, $set: { updatedAt: now } },
    { returnDocument: 'after' }
  );
  if (!ledger) return null;

  const reservation = {
    id: uuidv4(),
    userId,
    bytes,
    status: 'reserved',
    expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
    createdAt: now,
    ...metadata,
  };
  await db.collection('upload_reservations').insertOne(reservation);
  return reservation;
}

export async function releaseReservation(db, reservationId, status = 'released') {
  const row = await db.collection('upload_reservations').findOneAndUpdate(
    { id: reservationId, status: 'reserved' },
    { $set: { status, releasedAt: new Date() } },
    { returnDocument: 'before' }
  );
  if (!row) return null;
  await db.collection('upload_quota_ledgers').updateOne(
    { userId: row.userId },
    { $inc: { reservedBytes: -(row.bytes || 0) }, $set: { updatedAt: new Date() } }
  );
  return row;
}

export async function consumeReservation(db, reservationId) {
  return releaseReservation(db, reservationId, 'consumed');
}
