import { v4 as uuidv4 } from 'uuid';

const DEFAULT_TARGET_PROFIT_MARGIN = 0.25;
const DEFAULT_NON_AI_COST_RESERVE_RATIO = 0.55;
const DEFAULT_MAX_AI_SHARE_OF_REVENUE = 0.12;
const RESERVATION_TTL_MS = 30 * 60 * 1000;
const SHARED_RESERVATION_TTL_MS = 45 * 60 * 1000;

function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function monthKey(date = new Date()) {
  const start = monthStart(date);
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value, fallback) {
  return Math.max(0, Math.min(1, finite(value, fallback)));
}

function resultDocument(result) {
  return result?.value || result || null;
}

async function recognizedRevenueForMonth(db, start, end) {
  const ledger = await db.collection('financial_ledger').aggregate([
    {
      $match: {
        type: 'revenue',
        status: { $in: ['settled', 'recognized'] },
        recognizedAt: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: null, total: { $sum: '$netAmountUsd' } } },
  ]).toArray().catch(() => []);

  if (ledger.length) return Math.max(0, finite(ledger[0]?.total, 0));

  const snapshot = await db.collection('business_financial_snapshots').findOne(
    { monthStart: start },
    { sort: { createdAt: -1 } },
  ).catch(() => null);

  return Math.max(0, finite(
    snapshot?.recognizedNetRevenueUsd
      ?? snapshot?.netRevenueUsd
      ?? snapshot?.realizedRevenueNet
      ?? snapshot?.revenueNet,
    0,
  ));
}

async function currentConfig(db) {
  const config = await db.collection('ai_profit_guard_config').findOne({ key: 'global' }).catch(() => null);
  const maxMeteredWorkShareOfRevenue = clamp01(
    config?.maxMeteredWorkShareOfRevenue ?? config?.maxAiShareOfRevenue,
    DEFAULT_MAX_AI_SHARE_OF_REVENUE,
  );
  return {
    targetProfitMargin: clamp01(config?.targetProfitMargin, DEFAULT_TARGET_PROFIT_MARGIN),
    nonAiCostReserveRatio: clamp01(config?.nonAiCostReserveRatio, DEFAULT_NON_AI_COST_RESERVE_RATIO),
    maxAiShareOfRevenue: maxMeteredWorkShareOfRevenue,
    maxMeteredWorkShareOfRevenue,
    enabled: config?.enabled !== false,
  };
}

async function legacyReservedForMonth(db, collectionName, start, end) {
  const rows = await db.collection(collectionName).aggregate([
    {
      $match: {
        status: 'reserved',
        expiresAt: { $gt: new Date() },
        createdAt: { $gte: start, $lt: end },
        $or: [
          { sharedBudgetReservationId: { $exists: false } },
          { sharedBudgetReservationId: null },
        ],
      },
    },
    { $group: { _id: null, total: { $sum: '$reservedCostUsd' } } },
  ]).toArray().catch(() => []);
  return Math.max(0, finite(rows[0]?.total, 0));
}

async function settledForMonth(db, collectionName, start, end) {
  const rows = await db.collection(collectionName).aggregate([
    {
      $match: {
        status: 'settled',
        createdAt: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: null, total: { $sum: '$actualCostUsd' } } },
  ]).toArray().catch(() => []);
  return Math.max(0, finite(rows[0]?.total, 0));
}

async function sharedReservedForMonth(db, start, end) {
  const rows = await db.collection('metered_work_budget_reservations').aggregate([
    {
      $match: {
        status: 'reserved',
        expiresAt: { $gt: new Date() },
        createdAt: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: '$kind', total: { $sum: '$reservedCostUsd' } } },
  ]).toArray().catch(() => []);
  const totals = { ai: 0, product: 0 };
  for (const row of rows) {
    if (row?._id === 'ai' || row?._id === 'product') totals[row._id] = Math.max(0, finite(row.total, 0));
  }
  return totals;
}

async function expireSharedBudgetReservations(db, now = new Date()) {
  const expired = await db.collection('metered_work_budget_reservations')
    .find({ status: 'reserved', expiresAt: { $lte: now } })
    .limit(200)
    .toArray()
    .catch(() => []);

  for (const row of expired) {
    const claimed = resultDocument(await db.collection('metered_work_budget_reservations').findOneAndUpdate(
      { id: row.id, status: 'reserved' },
      { $set: { status: 'expired', expiredAt: now } },
      { returnDocument: 'before' },
    ).catch(() => null));
    if (!claimed) continue;
    await db.collection('metered_work_budget_months').updateOne(
      { _id: claimed.monthKey, reservedUsd: { $gte: claimed.reservedCostUsd } },
      { $inc: { reservedUsd: -claimed.reservedCostUsd }, $set: { updatedAt: now } },
    ).catch(() => null);
  }
}

export async function getAiProfitGuardSnapshot({ db, now = new Date() }) {
  if (!db) throw new Error('Database is required for AI Profit Guard.');

  const start = monthStart(now);
  const end = nextMonthStart(now);
  const [
    revenue,
    config,
    settledAi,
    settledProduct,
    legacyReservedAi,
    legacyReservedProduct,
    sharedReserved,
  ] = await Promise.all([
    recognizedRevenueForMonth(db, start, end),
    currentConfig(db),
    settledForMonth(db, 'ai_cost_ledger', start, end),
    settledForMonth(db, 'product_cost_ledger', start, end),
    legacyReservedForMonth(db, 'ai_cost_reservations', start, end),
    legacyReservedForMonth(db, 'product_cost_reservations', start, end),
    sharedReservedForMonth(db, start, end),
  ]);

  const marginProtectedAmount = revenue * config.targetProfitMargin;
  const nonAiReserveAmount = revenue * config.nonAiCostReserveRatio;
  const shareCeiling = revenue * config.maxMeteredWorkShareOfRevenue;
  const residualAfterProtectedProfitAndOperations = Math.max(0, revenue - marginProtectedAmount - nonAiReserveAmount);
  const externalWorkBudgetCeiling = Math.max(0, Math.min(shareCeiling, residualAfterProtectedProfitAndOperations));
  const reservedAi = legacyReservedAi + sharedReserved.ai;
  const reservedProduct = legacyReservedProduct + sharedReserved.product;
  const committedAiSpend = settledAi + reservedAi;
  const committedProductSpend = settledProduct + reservedProduct;
  const committedExternalWorkSpend = committedAiSpend + committedProductSpend;
  const remainingExternalWorkBudget = Math.max(0, externalWorkBudgetCeiling - committedExternalWorkSpend);

  return {
    enabled: config.enabled,
    monthStart: start,
    monthEnd: end,
    monthKey: monthKey(now),
    recognizedRevenueUsd: Number(revenue.toFixed(6)),
    targetProfitMargin: config.targetProfitMargin,
    protectedProfitUsd: Number(marginProtectedAmount.toFixed(6)),
    nonAiCostReserveRatio: config.nonAiCostReserveRatio,
    nonAiReserveUsd: Number(nonAiReserveAmount.toFixed(6)),
    maxAiShareOfRevenue: config.maxAiShareOfRevenue,
    maxMeteredWorkShareOfRevenue: config.maxMeteredWorkShareOfRevenue,
    aiBudgetCeilingUsd: Number(externalWorkBudgetCeiling.toFixed(6)),
    externalWorkBudgetCeilingUsd: Number(externalWorkBudgetCeiling.toFixed(6)),
    settledAiSpendUsd: Number(settledAi.toFixed(6)),
    reservedAiSpendUsd: Number(reservedAi.toFixed(6)),
    settledProductSpendUsd: Number(settledProduct.toFixed(6)),
    reservedProductSpendUsd: Number(reservedProduct.toFixed(6)),
    legacyReservedAiSpendUsd: Number(legacyReservedAi.toFixed(6)),
    legacyReservedProductSpendUsd: Number(legacyReservedProduct.toFixed(6)),
    sharedReservedAiSpendUsd: Number(sharedReserved.ai.toFixed(6)),
    sharedReservedProductSpendUsd: Number(sharedReserved.product.toFixed(6)),
    committedExternalWorkSpendUsd: Number(committedExternalWorkSpend.toFixed(6)),
    remainingAiBudgetUsd: Number(remainingExternalWorkBudget.toFixed(6)),
    remainingExternalWorkBudgetUsd: Number(remainingExternalWorkBudget.toFixed(6)),
    failClosed: revenue <= 0,
  };
}

export async function reserveMeteredWorkSpend({
  db,
  kind,
  feature,
  userId = null,
  estimatedCostUsd,
  essential = false,
  metadata = {},
  now = new Date(),
}) {
  if (!db) return { allowed: false, reason: 'profit_guard_database_unavailable' };
  if (kind !== 'ai' && kind !== 'product') return { allowed: false, reason: 'metered_work_kind_invalid' };
  const estimate = finite(estimatedCostUsd, Number.NaN);
  if (!Number.isFinite(estimate) || estimate <= 0) return { allowed: false, reason: 'metered_work_cost_estimate_required' };

  await expireSharedBudgetReservations(db, now);
  const snapshot = await getAiProfitGuardSnapshot({ db, now });
  if (!snapshot.enabled) {
    return { allowed: true, sharedBudgetReservationId: null, approvedCostUsd: estimate, reason: 'profit_guard_disabled', snapshot };
  }
  if (snapshot.failClosed && !essential) return { allowed: false, reason: 'no_recognized_revenue', snapshot };

  const baselineCommittedUsd = Math.max(0,
    snapshot.settledAiSpendUsd
      + snapshot.settledProductSpendUsd
      + snapshot.legacyReservedAiSpendUsd
      + snapshot.legacyReservedProductSpendUsd,
  );
  const ceilingUsd = Math.max(0, snapshot.externalWorkBudgetCeilingUsd);
  if (baselineCommittedUsd + estimate > ceilingUsd) {
    return { allowed: false, reason: 'profit_margin_protection', snapshot };
  }

  const periodKey = snapshot.monthKey;
  const reservationId = uuidv4();
  let budget = resultDocument(await db.collection('metered_work_budget_months').findOneAndUpdate(
    {
      _id: periodKey,
      $expr: {
        $lte: [
          { $add: [{ $ifNull: ['$reservedUsd', 0] }, baselineCommittedUsd, estimate] },
          ceilingUsd,
        ],
      },
    },
    {
      $inc: { reservedUsd: estimate },
      $set: { ceilingUsd, baselineCommittedUsd, monthStart: snapshot.monthStart, monthEnd: snapshot.monthEnd, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { returnDocument: 'after' },
  ).catch(() => null));

  if (!budget) {
    try {
      await db.collection('metered_work_budget_months').insertOne({
        _id: periodKey,
        reservedUsd: estimate,
        ceilingUsd,
        baselineCommittedUsd,
        monthStart: snapshot.monthStart,
        monthEnd: snapshot.monthEnd,
        createdAt: now,
        updatedAt: now,
      });
      budget = { _id: periodKey, reservedUsd: estimate };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      budget = resultDocument(await db.collection('metered_work_budget_months').findOneAndUpdate(
        {
          _id: periodKey,
          $expr: {
            $lte: [
              { $add: [{ $ifNull: ['$reservedUsd', 0] }, baselineCommittedUsd, estimate] },
              ceilingUsd,
            ],
          },
        },
        { $inc: { reservedUsd: estimate }, $set: { ceilingUsd, baselineCommittedUsd, updatedAt: now } },
        { returnDocument: 'after' },
      ).catch(() => null));
    }
  }

  if (!budget) return { allowed: false, reason: 'profit_margin_protection', snapshot };

  try {
    await db.collection('metered_work_budget_reservations').insertOne({
      id: reservationId,
      monthKey: periodKey,
      kind,
      feature,
      userId,
      reservedCostUsd: estimate,
      status: 'reserved',
      essential: Boolean(essential),
      metadata,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SHARED_RESERVATION_TTL_MS),
    });
  } catch (error) {
    await db.collection('metered_work_budget_months').updateOne(
      { _id: periodKey, reservedUsd: { $gte: estimate } },
      { $inc: { reservedUsd: -estimate }, $set: { updatedAt: new Date() } },
    ).catch(() => null);
    throw error;
  }

  return {
    allowed: true,
    sharedBudgetReservationId: reservationId,
    approvedCostUsd: estimate,
    reason: 'within_profit_budget',
    snapshot,
  };
}

async function closeMeteredWorkReservation({ db, sharedBudgetReservationId, status, reason = null, now = new Date() }) {
  if (!db || !sharedBudgetReservationId) return { closed: false, reason: 'no_shared_budget_reservation' };
  const claimed = resultDocument(await db.collection('metered_work_budget_reservations').findOneAndUpdate(
    { id: sharedBudgetReservationId, status: 'reserved' },
    {
      $set: {
        status,
        ...(reason ? { closeReason: reason } : {}),
        closedAt: now,
      },
    },
    { returnDocument: 'before' },
  ));
  if (!claimed) return { closed: false, reason: 'shared_budget_reservation_not_active' };

  await db.collection('metered_work_budget_months').updateOne(
    { _id: claimed.monthKey, reservedUsd: { $gte: claimed.reservedCostUsd } },
    { $inc: { reservedUsd: -claimed.reservedCostUsd }, $set: { updatedAt: now } },
  ).catch(() => null);
  return { closed: true, reservedCostUsd: claimed.reservedCostUsd };
}

export async function settleMeteredWorkSpendReservation({ db, sharedBudgetReservationId, now = new Date() }) {
  return closeMeteredWorkReservation({ db, sharedBudgetReservationId, status: 'settled', now });
}

export async function releaseMeteredWorkSpendReservation({ db, sharedBudgetReservationId, reason = 'released', now = new Date() }) {
  return closeMeteredWorkReservation({ db, sharedBudgetReservationId, status: 'released', reason, now });
}

export async function reserveAiSpend({ db, feature, agentId = null, userId = null, estimatedCostUsd, essential = false, metadata = {} }) {
  const estimate = Math.max(0, finite(estimatedCostUsd, 0));
  if (!db) return { allowed: false, reason: 'profit_guard_database_unavailable' };
  if (estimate <= 0) return { allowed: true, reservationId: null, reason: 'no_external_ai_cost' };

  await db.collection('ai_cost_reservations').updateMany(
    { status: 'reserved', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired', expiredAt: new Date() } },
  ).catch(() => null);

  const shared = await reserveMeteredWorkSpend({
    db,
    kind: 'ai',
    feature,
    userId,
    estimatedCostUsd: estimate,
    essential,
    metadata: { agentId, ...metadata },
  });
  if (!shared.allowed) {
    await recordDecision(db, { feature, agentId, userId, estimatedCostUsd: estimate, allowed: false, reason: shared.reason, metadata });
    return { allowed: false, reason: shared.reason, snapshot: shared.snapshot };
  }

  const reservationId = uuidv4();
  try {
    await db.collection('ai_cost_reservations').insertOne({
      id: reservationId,
      sharedBudgetReservationId: shared.sharedBudgetReservationId,
      feature,
      agentId,
      userId,
      reservedCostUsd: estimate,
      status: 'reserved',
      essential: Boolean(essential),
      metadata,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
    });
  } catch (error) {
    await releaseMeteredWorkSpendReservation({ db, sharedBudgetReservationId: shared.sharedBudgetReservationId, reason: 'ai_reservation_insert_failed' });
    throw error;
  }

  await recordDecision(db, { feature, agentId, userId, estimatedCostUsd: estimate, allowed: true, reason: shared.reason, metadata });
  return { allowed: true, reservationId, sharedBudgetReservationId: shared.sharedBudgetReservationId, reason: shared.reason, snapshot: shared.snapshot };
}

export async function settleAiSpend({ db, reservationId = null, feature, agentId = null, userId = null, actualCostUsd, provider = null, model = null, metadata = {} }) {
  if (!db) return;
  const cost = Math.max(0, finite(actualCostUsd, 0));
  const now = new Date();
  const reservation = reservationId
    ? await db.collection('ai_cost_reservations').findOne({ id: reservationId }).catch(() => null)
    : null;

  await db.collection('ai_cost_ledger').insertOne({
    id: uuidv4(),
    reservationId,
    feature,
    agentId,
    userId,
    provider,
    model,
    actualCostUsd: cost,
    status: 'settled',
    metadata,
    createdAt: now,
  });

  if (reservationId) {
    await db.collection('ai_cost_reservations').updateOne(
      { id: reservationId, status: 'reserved' },
      { $set: { status: 'settled', settledAt: now, actualCostUsd: cost } },
    ).catch(() => null);
  }
  if (reservation?.sharedBudgetReservationId) {
    await settleMeteredWorkSpendReservation({ db, sharedBudgetReservationId: reservation.sharedBudgetReservationId, now });
  }
}

export async function releaseAiSpendReservation({ db, reservationId, reason = 'released' }) {
  if (!db || !reservationId) return;
  const reservation = await db.collection('ai_cost_reservations').findOne({ id: reservationId }).catch(() => null);
  const result = await db.collection('ai_cost_reservations').updateOne(
    { id: reservationId, status: 'reserved' },
    { $set: { status: 'released', releaseReason: reason, releasedAt: new Date() } },
  ).catch(() => null);
  if (result?.matchedCount === 1 && reservation?.sharedBudgetReservationId) {
    await releaseMeteredWorkSpendReservation({ db, sharedBudgetReservationId: reservation.sharedBudgetReservationId, reason });
  }
}

async function recordDecision(db, { feature, agentId, userId, estimatedCostUsd, allowed, reason, metadata }) {
  await db.collection('ai_profit_guard_decisions').insertOne({
    id: uuidv4(),
    feature,
    agentId,
    userId,
    estimatedCostUsd,
    allowed,
    reason,
    metadata,
    createdAt: new Date(),
  }).catch(() => null);
}
