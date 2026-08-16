import { v4 as uuidv4 } from 'uuid';
import {
  releaseMeteredWorkSpendReservation,
  reserveMeteredWorkSpend,
  settleMeteredWorkSpendReservation,
} from './ai-profit-guard.js';

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

  const shared = await reserveMeteredWorkSpend({
    db,
    kind: 'product',
    feature,
    userId,
    estimatedCostUsd: estimate,
    essential,
    metadata,
  });
  if (!shared.allowed) {
    const reason = shared.reason === 'metered_work_cost_estimate_required'
      ? 'product_cost_estimate_required'
      : shared.reason;
    await recordDecision(db, { feature, userId, estimatedCostUsd: estimate, allowed: false, reason, metadata });
    return { allowed: false, reason, snapshot: shared.snapshot || null };
  }

  const reservationId = uuidv4();
  try {
    await db.collection('product_cost_reservations').insertOne({
      id: reservationId,
      sharedBudgetReservationId: shared.sharedBudgetReservationId,
      feature,
      userId,
      reservedCostUsd: estimate,
      status: 'reserved',
      essential: Boolean(essential),
      metadata,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
    });
  } catch (error) {
    await releaseMeteredWorkSpendReservation({
      db,
      sharedBudgetReservationId: shared.sharedBudgetReservationId,
      reason: 'product_reservation_insert_failed',
    });
    throw error;
  }

  await recordDecision(db, { feature, userId, estimatedCostUsd: estimate, allowed: true, reason: shared.reason, metadata });
  return {
    allowed: true,
    reservationId,
    sharedBudgetReservationId: shared.sharedBudgetReservationId,
    approvedCostUsd: estimate,
    reason: shared.reason,
    snapshot: shared.snapshot,
  };
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
  const reservation = reservationId
    ? await db.collection('product_cost_reservations').findOne({ id: reservationId }).catch(() => null)
    : null;
  if (reservationId && reservation?.status !== 'reserved' && reservation?.status !== 'settled') return null;

  const approved = reservationId
    ? Math.max(0, finite(reservation?.reservedCostUsd, 0))
    : actual;
  const costOverrunUsd = Math.max(0, actual - approved);
  const ledgerId = reservationId ? `product:${reservationId}` : uuidv4();

  // The ledger always records the actual measured spend, including any amount
  // above the estimate. Hiding an overrun at the approved amount would make the
  // shared Profit Guard understate real margin loss on subsequent decisions.
  try {
    await db.collection('product_cost_ledger').insertOne({
      _id: ledgerId,
      id: uuidv4(),
      reservationId,
      feature,
      userId,
      provider,
      actualCostUsd: actual,
      approvedCostUsd: approved,
      costOverrunUsd,
      status: 'settled',
      metadata: { approvedCostUsd: approved, costOverrunUsd, ...metadata },
      createdAt: now,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  if (reservationId && reservation?.status === 'reserved') {
    await db.collection('product_cost_reservations').updateOne(
      { id: reservationId, status: 'reserved' },
      { $set: { status: 'settled', settledAt: now, actualCostUsd: actual, approvedCostUsd: approved, costOverrunUsd } },
    );
  }
  if (reservation?.sharedBudgetReservationId) {
    await settleMeteredWorkSpendReservation({ db, sharedBudgetReservationId: reservation.sharedBudgetReservationId, now });
  }

  return { actualCostUsd: actual, approvedCostUsd: approved, costOverrunUsd };
}

export async function releaseProductSpendReservation({ db, reservationId, reason = 'released' }) {
  if (!db || !reservationId) return;
  const reservation = await db.collection('product_cost_reservations').findOne({ id: reservationId }).catch(() => null);
  const result = await db.collection('product_cost_reservations').updateOne(
    { id: reservationId, status: 'reserved' },
    { $set: { status: 'released', releaseReason: reason, releasedAt: new Date() } },
  ).catch(() => null);
  if (result?.matchedCount === 1 && reservation?.sharedBudgetReservationId) {
    await releaseMeteredWorkSpendReservation({ db, sharedBudgetReservationId: reservation.sharedBudgetReservationId, reason });
  }
}
