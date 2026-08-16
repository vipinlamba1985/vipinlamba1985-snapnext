import { v4 as uuidv4 } from 'uuid';
import { getAiProfitGuardSnapshot } from './ai-profit-guard.js';

const RESERVATION_TTL_MS = 45 * 60 * 1000;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function recordDecision(db, { feature, userId, estimatedCostUsd, allowed, reason, metadata }) {
  await db.collection('product_profit_guard_decisions').insertOne({
    id: uuidv4(),
    feature,
    userId,
    estimatedCostUsd,
    allowed,
    reason,
    metadata,
    createdAt: new Date(),
  }).catch(() => null);
}

export async function reserveProductSpend({
  db,
  feature,
  userId = null,
  estimatedCostUsd,
  essential = false,
  metadata = {},
}) {
  if (!db) return { allowed: false, reason: 'profit_guard_database_unavailable' };
  const estimate = finite(estimatedCostUsd, Number.NaN);
  if (!Number.isFinite(estimate) || estimate <= 0) {
    return { allowed: false, reason: 'product_cost_estimate_required' };
  }

  await db.collection('product_cost_reservations').updateMany(
    { status: 'reserved', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired', expiredAt: new Date() } },
  ).catch(() => null);

  const snapshot = await getAiProfitGuardSnapshot({ db });
  if (!snapshot.enabled) {
    return { allowed: true, reservationId: null, approvedCostUsd: estimate, reason: 'profit_guard_disabled', snapshot };
  }

  if (snapshot.failClosed && !essential) {
    await recordDecision(db, { feature, userId, estimatedCostUsd: estimate, allowed: false, reason: 'no_recognized_revenue', metadata });
    return { allowed: false, reason: 'no_recognized_revenue', snapshot };
  }

  const remaining = Number(snapshot.remainingExternalWorkBudgetUsd ?? snapshot.remainingAiBudgetUsd ?? 0);
  if (estimate > remaining) {
    await recordDecision(db, { feature, userId, estimatedCostUsd: estimate, allowed: false, reason: 'profit_margin_protection', metadata });
    return { allowed: false, reason: 'profit_margin_protection', snapshot };
  }

  const reservationId = uuidv4();
  await db.collection('product_cost_reservations').insertOne({
    id: reservationId,
    feature,
    userId,
    reservedCostUsd: estimate,
    status: 'reserved',
    essential: Boolean(essential),
    metadata,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
  });

  await recordDecision(db, { feature, userId, estimatedCostUsd: estimate, allowed: true, reason: 'within_profit_budget', metadata });
  return { allowed: true, reservationId, approvedCostUsd: estimate, reason: 'within_profit_budget', snapshot };
}

export async function settleProductSpend({
  db,
  reservationId = null,
  feature,
  userId = null,
  actualCostUsd,
  provider = null,
  metadata = {},
}) {
  if (!db) return null;
  const actual = Math.max(0, finite(actualCostUsd, 0));
  const now = new Date();
  let approved = actual;

  if (reservationId) {
    const reservation = await db.collection('product_cost_reservations').findOne({ id: reservationId }).catch(() => null);
    if (reservation?.status !== 'reserved') return null;
    approved = Math.max(0, finite(reservation.reservedCostUsd, 0));
  }
  const settledCostUsd = Math.min(actual, approved);

  if (reservationId) {
    const result = await db.collection('product_cost_reservations').updateOne(
      { id: reservationId, status: 'reserved' },
      { $set: { status: 'settled', settledAt: now, actualCostUsd: settledCostUsd, reportedActualCostUsd: actual } },
    );
    if (result.matchedCount !== 1) return null;
  }

  await db.collection('product_cost_ledger').insertOne({
    id: uuidv4(),
    reservationId,
    feature,
    userId,
    provider,
    actualCostUsd: settledCostUsd,
    reportedActualCostUsd: actual,
    status: 'settled',
    metadata: { approvedCostUsd: approved, ...metadata },
    createdAt: now,
  });

  return { settledCostUsd, approvedCostUsd: approved, reportedActualCostUsd: actual };
}

export async function releaseProductSpendReservation({ db, reservationId, reason = 'released' }) {
  if (!db || !reservationId) return;
  await db.collection('product_cost_reservations').updateOne(
    { id: reservationId, status: 'reserved' },
    { $set: { status: 'released', releaseReason: reason, releasedAt: new Date() } },
  ).catch(() => null);
}
