import { v4 as uuidv4 } from 'uuid';
import { getPlan } from './plans.js';

const RESERVATION_TTL_MS = 45 * 60 * 1000;

function resultDocument(result) {
  return result?.value || result || null;
}

export function renderQuotaForPlan(planId) {
  const limit = Number(getPlan(planId)?.reelRendersPerMonth);
  return Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 0;
}

export function renderQuotaPeriod(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  return { key, start, end };
}

export function renderQuotaDecision({ used = 0, reserved = 0, limit = 0 } = {}) {
  const safeUsed = Math.max(0, Math.floor(Number(used) || 0));
  const safeReserved = Math.max(0, Math.floor(Number(reserved) || 0));
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  const committed = safeUsed + safeReserved;
  return {
    allowed: committed < safeLimit,
    used: safeUsed,
    reserved: safeReserved,
    committed,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - committed),
  };
}

async function expireReservations({ db, now = new Date() }) {
  const expired = await db.collection('render_quota_reservations')
    .find({ status: 'reserved', expiresAt: { $lte: now } })
    .limit(100)
    .toArray()
    .catch(() => []);

  for (const row of expired) {
    const claimed = resultDocument(await db.collection('render_quota_reservations').findOneAndUpdate(
      { id: row.id, status: 'reserved' },
      { $set: { status: 'expired', expiredAt: now } },
      { returnDocument: 'before' },
    ).catch(() => null));
    if (!claimed) continue;
    await db.collection('render_quota_usage').updateOne(
      { _id: claimed.usageId, reserved: { $gt: 0 } },
      { $inc: { reserved: -1 }, $set: { updatedAt: now } },
    ).catch(() => null);
  }
}

export async function getCanonicalRenderQuotaSnapshot({ db, userId, planId, now = new Date() }) {
  if (!db || !userId) throw new Error('Database and user id are required for render quota.');
  const limit = renderQuotaForPlan(planId);
  if (limit >= Number.MAX_SAFE_INTEGER) {
    return { unlimited: true, allowed: true, used: 0, reserved: 0, committed: 0, limit, remaining: limit, period: renderQuotaPeriod(now) };
  }
  const period = renderQuotaPeriod(now);
  const usageId = `${userId}:${period.key}`;
  const row = await db.collection('render_quota_usage').findOne({ _id: usageId }).catch(() => null);
  return { unlimited: false, ...renderQuotaDecision({ used: row?.used, reserved: row?.reserved, limit }), period };
}

export async function reserveCanonicalRenderQuota({ db, userId, planId, manifestHash, now = new Date() }) {
  if (!db || !userId) return { allowed: false, reason: 'render_quota_database_unavailable' };
  const limit = renderQuotaForPlan(planId);
  const period = renderQuotaPeriod(now);
  if (limit >= Number.MAX_SAFE_INTEGER) {
    return { allowed: true, reservationId: null, reason: 'render_quota_unlimited', snapshot: { unlimited: true, limit, period } };
  }
  if (limit <= 0) {
    return { allowed: false, reason: 'render_quota_not_in_plan', snapshot: { unlimited: false, limit: 0, period } };
  }

  await expireReservations({ db, now });
  const usageId = `${userId}:${period.key}`;
  const reservationId = uuidv4();

  // `_id` makes the monthly usage row unique. The conditional increment is the
  // authoritative quota gate once the row exists.
  let updated = resultDocument(await db.collection('render_quota_usage').findOneAndUpdate(
    {
      _id: usageId,
      $expr: { $lt: [{ $add: [{ $ifNull: ['$used', 0] }, { $ifNull: ['$reserved', 0] }] }, limit] },
    },
    {
      $inc: { reserved: 1 },
      $set: { userId, periodKey: period.key, periodStart: period.start, periodEnd: period.end, limit, updatedAt: now },
      $setOnInsert: { used: 0, createdAt: now },
    },
    { returnDocument: 'after' },
  ).catch(() => null));

  if (!updated) {
    try {
      await db.collection('render_quota_usage').insertOne({
        _id: usageId,
        userId,
        periodKey: period.key,
        periodStart: period.start,
        periodEnd: period.end,
        limit,
        used: 0,
        reserved: 1,
        createdAt: now,
        updatedAt: now,
      });
      updated = { _id: usageId, used: 0, reserved: 1, limit };
    } catch (error) {
      if (error?.code === 11000) {
        updated = resultDocument(await db.collection('render_quota_usage').findOneAndUpdate(
          {
            _id: usageId,
            $expr: { $lt: [{ $add: [{ $ifNull: ['$used', 0] }, { $ifNull: ['$reserved', 0] }] }, limit] },
          },
          { $inc: { reserved: 1 }, $set: { limit, updatedAt: now } },
          { returnDocument: 'after' },
        ).catch(() => null));
      } else {
        throw error;
      }
    }
  }

  if (!updated) {
    const snapshot = await getCanonicalRenderQuotaSnapshot({ db, userId, planId, now });
    return { allowed: false, reason: 'monthly_render_quota_exhausted', snapshot };
  }

  try {
    await db.collection('render_quota_reservations').insertOne({
      id: reservationId,
      usageId,
      userId,
      manifestHash,
      planId,
      status: 'reserved',
      createdAt: now,
      expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
    });
  } catch (error) {
    await db.collection('render_quota_usage').updateOne(
      { _id: usageId, reserved: { $gt: 0 } },
      { $inc: { reserved: -1 }, $set: { updatedAt: new Date() } },
    ).catch(() => null);
    throw error;
  }

  return {
    allowed: true,
    reservationId,
    reason: 'render_quota_reserved',
    snapshot: {
      unlimited: false,
      ...renderQuotaDecision({ used: updated.used, reserved: updated.reserved, limit }),
      period,
    },
  };
}

export async function settleCanonicalRenderQuota({ db, reservationId, artifactId = null, now = new Date() }) {
  if (!db || !reservationId) return { settled: false, reason: 'no_render_quota_reservation' };
  const claimed = resultDocument(await db.collection('render_quota_reservations').findOneAndUpdate(
    { id: reservationId, status: 'reserved' },
    { $set: { status: 'settled', artifactId, settledAt: now } },
    { returnDocument: 'before' },
  ));
  if (!claimed) return { settled: false, reason: 'render_quota_reservation_not_active' };

  await db.collection('render_quota_usage').updateOne(
    { _id: claimed.usageId, reserved: { $gt: 0 } },
    { $inc: { reserved: -1, used: 1 }, $set: { updatedAt: now } },
  );
  return { settled: true, usageId: claimed.usageId };
}

export async function releaseCanonicalRenderQuota({ db, reservationId, reason = 'released', now = new Date() }) {
  if (!db || !reservationId) return { released: false, reason: 'no_render_quota_reservation' };
  const claimed = resultDocument(await db.collection('render_quota_reservations').findOneAndUpdate(
    { id: reservationId, status: 'reserved' },
    { $set: { status: 'released', releaseReason: reason, releasedAt: now } },
    { returnDocument: 'before' },
  ));
  if (!claimed) return { released: false, reason: 'render_quota_reservation_not_active' };

  await db.collection('render_quota_usage').updateOne(
    { _id: claimed.usageId, reserved: { $gt: 0 } },
    { $inc: { reserved: -1 }, $set: { updatedAt: now } },
  ).catch(() => null);
  return { released: true, usageId: claimed.usageId };
}
