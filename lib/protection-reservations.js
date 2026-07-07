import { v4 as uuidv4 } from 'uuid';

const RESERVATION_TTL_MS = 60 * 60 * 1000;

function resultDocument(result) {
  return result?.value || result || null;
}

export async function cleanupExpiredReservations(db, userId) {
  const now = new Date();
  const expired = await db.collection('upload_reservations').find({ userId, status: 'reserved', expiresAt: { $lte: now } }).toArray();
  let released = 0;
  for (const row of expired) {
    const changed = resultDocument(await db.collection('upload_reservations').findOneAndUpdate(
      { id: row.id, status: 'reserved' },
      { $set: { status: 'expired', releasedAt: now } },
      { returnDocument: 'before' }
    ));
    if (changed) released += changed.bytes || 0;
  }
  if (released) await db.collection('upload_quota_ledgers').updateOne({ userId }, { $inc: { reservedBytes: -released }, $set: { updatedAt: now } });
  return released;
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
  const ledger = resultDocument(await db.collection('upload_quota_ledgers').findOneAndUpdate(
    { userId, reservedBytes: { $lte: maxReserved } },
    { $inc: { reservedBytes: bytes }, $set: { updatedAt: now } },
    { returnDocument: 'after' }
  ));
  if (!ledger) return null;

  const reservation = {
    id: uuidv4(), userId, bytes, status: 'reserved',
    expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS), createdAt: now,
    ...metadata,
  };
  await db.collection('upload_reservations').insertOne(reservation);
  return reservation;
}

export async function releaseReservation(db, reservationId, status = 'released') {
  const row = resultDocument(await db.collection('upload_reservations').findOneAndUpdate(
    { id: reservationId, status: 'reserved' },
    { $set: { status, releasedAt: new Date() } },
    { returnDocument: 'before' }
  ));
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
