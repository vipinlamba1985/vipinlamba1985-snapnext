import { v4 as uuidv4 } from 'uuid';

export const RESERVATION_TTL_MS = 60 * 60 * 1000;
export const MAX_RELEASE_RESERVATIONS = 200;

function resultDocument(result) {
  return result?.value || result || null;
}

export function normalizeServerReservationIds(values = [], limit = MAX_RELEASE_RESERVATIONS) {
  const source = Array.isArray(values) ? values : [values];
  const output = [];
  const seen = new Set();
  for (const value of source) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id || id.length > 128 || !/^[A-Za-z0-9_-]+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length >= limit) break;
  }
  return output;
}

export async function cleanupExpiredReservations(db, userId) {
  const now = new Date();
  const expired = await db.collection('upload_reservations')
    .find({ userId, status: 'reserved', expiresAt: { $lte: now } })
    .toArray();
  let released = 0;
  for (const row of expired) {
    const changed = resultDocument(await db.collection('upload_reservations').findOneAndUpdate(
      { id: row.id, userId, status: 'reserved' },
      { $set: { status: 'expired', releasedAt: now } },
      { returnDocument: 'before' }
    ));
    if (changed) released += changed.bytes || 0;
  }
  if (released) {
    await db.collection('upload_quota_ledgers').updateOne(
      { userId },
      { $inc: { reservedBytes: -released }, $set: { updatedAt: now } }
    );
  }
  return released;
}

async function compensateFailedReservationInsert(db, userId, bytes) {
  await db.collection('upload_quota_ledgers').updateOne(
    { userId },
    { $inc: { reservedBytes: -bytes }, $set: { updatedAt: new Date() } }
  );
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
  try {
    await db.collection('upload_reservations').insertOne(reservation);
  } catch (error) {
    // The ledger is incremented before the reservation row so concurrent quota
    // checks remain atomic. If the row insert fails, compensate immediately or
    // the user loses quota without any reservation that cleanup can discover.
    await compensateFailedReservationInsert(db, userId, bytes).catch(() => null);
    throw error;
  }
  return reservation;
}

export async function releaseReservation(db, reservationId, status = 'released', { userId } = {}) {
  const filter = { id: reservationId, status: 'reserved' };
  if (userId) filter.userId = userId;
  const now = new Date();
  const row = resultDocument(await db.collection('upload_reservations').findOneAndUpdate(
    filter,
    { $set: { status, releasedAt: now } },
    { returnDocument: 'before' }
  ));
  if (!row) return null;
  await db.collection('upload_quota_ledgers').updateOne(
    { userId: row.userId },
    { $inc: { reservedBytes: -(row.bytes || 0) }, $set: { updatedAt: now } }
  );
  return row;
}

export async function releaseReservations(db, {
  reservationIds,
  userId,
  status = 'released',
} = {}) {
  const ids = normalizeServerReservationIds(reservationIds);
  const releasedIds = [];
  const ignoredIds = [];
  for (const id of ids) {
    const row = await releaseReservation(db, id, status, { userId });
    if (row) releasedIds.push(id);
    else ignoredIds.push(id);
  }
  return { requested: ids.length, releasedIds, ignoredIds };
}

export async function consumeReservation(db, reservationId, options) {
  return releaseReservation(db, reservationId, 'consumed', options);
}
