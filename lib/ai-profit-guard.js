import { v4 as uuidv4 } from 'uuid';

const DEFAULT_TARGET_PROFIT_MARGIN = 0.25;
const DEFAULT_NON_AI_COST_RESERVE_RATIO = 0.55;
const DEFAULT_MAX_AI_SHARE_OF_REVENUE = 0.12;
const RESERVATION_TTL_MS = 30 * 60 * 1000;

function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value, fallback) {
  return Math.max(0, Math.min(1, finite(value, fallback)));
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
  return {
    targetProfitMargin: clamp01(config?.targetProfitMargin, DEFAULT_TARGET_PROFIT_MARGIN),
    nonAiCostReserveRatio: clamp01(config?.nonAiCostReserveRatio, DEFAULT_NON_AI_COST_RESERVE_RATIO),
    maxAiShareOfRevenue: clamp01(config?.maxAiShareOfRevenue, DEFAULT_MAX_AI_SHARE_OF_REVENUE),
    enabled: config?.enabled !== false,
  };
}

async function aiSpendForMonth(db, start, end) {
  const settledRows = await db.collection('ai_cost_ledger').aggregate([
    {
      $match: {
        status: 'settled',
        createdAt: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: null, total: { $sum: '$actualCostUsd' } } },
  ]).toArray().catch(() => []);

  const activeReservations = await db.collection('ai_cost_reservations').aggregate([
    {
      $match: {
        status: 'reserved',
        expiresAt: { $gt: new Date() },
        createdAt: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: null, total: { $sum: '$reservedCostUsd' } } },
  ]).toArray().catch(() => []);

  return {
    settled: Math.max(0, finite(settledRows[0]?.total, 0)),
    reserved: Math.max(0, finite(activeReservations[0]?.total, 0)),
  };
}

export async function getAiProfitGuardSnapshot({ db, now = new Date() }) {
  if (!db) throw new Error('Database is required for AI Profit Guard.');

  const start = monthStart(now);
  const end = nextMonthStart(now);
  const [revenue, config, spend] = await Promise.all([
    recognizedRevenueForMonth(db, start, end),
    currentConfig(db),
    aiSpendForMonth(db, start, end),
  ]);

  const marginProtectedAmount = revenue * config.targetProfitMargin;
  const nonAiReserveAmount = revenue * config.nonAiCostReserveRatio;
  const shareCeiling = revenue * config.maxAiShareOfRevenue;
  const residualAfterProtectedProfitAndOperations = Math.max(0, revenue - marginProtectedAmount - nonAiReserveAmount);
  const aiBudgetCeiling = Math.max(0, Math.min(shareCeiling, residualAfterProtectedProfitAndOperations));
  const committedAiSpend = spend.settled + spend.reserved;
  const remainingAiBudget = Math.max(0, aiBudgetCeiling - committedAiSpend);

  return {
    enabled: config.enabled,
    monthStart: start,
    monthEnd: end,
    recognizedRevenueUsd: Number(revenue.toFixed(6)),
    targetProfitMargin: config.targetProfitMargin,
    protectedProfitUsd: Number(marginProtectedAmount.toFixed(6)),
    nonAiCostReserveRatio: config.nonAiCostReserveRatio,
    nonAiReserveUsd: Number(nonAiReserveAmount.toFixed(6)),
    maxAiShareOfRevenue: config.maxAiShareOfRevenue,
    aiBudgetCeilingUsd: Number(aiBudgetCeiling.toFixed(6)),
    settledAiSpendUsd: Number(spend.settled.toFixed(6)),
    reservedAiSpendUsd: Number(spend.reserved.toFixed(6)),
    remainingAiBudgetUsd: Number(remainingAiBudget.toFixed(6)),
    failClosed: revenue <= 0,
  };
}

export async function reserveAiSpend({ db, feature, agentId = null, userId = null, estimatedCostUsd, essential = false, metadata = {} }) {
  const estimate = Math.max(0, finite(estimatedCostUsd, 0));
  if (!db) return { allowed: false, reason: 'profit_guard_database_unavailable' };
  if (estimate <= 0) return { allowed: true, reservationId: null, reason: 'no_external_ai_cost' };

  await db.collection('ai_cost_reservations').updateMany(
    { status: 'reserved', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired', expiredAt: new Date() } },
  ).catch(() => null);

  const snapshot = await getAiProfitGuardSnapshot({ db });
  if (!snapshot.enabled) return { allowed: true, reservationId: null, reason: 'profit_guard_disabled', snapshot };

  if (snapshot.failClosed && !essential) {
    await recordDecision(db, { feature, agentId, userId, estimatedCostUsd: estimate, allowed: false, reason: 'no_recognized_revenue', metadata });
    return { allowed: false, reason: 'no_recognized_revenue', snapshot };
  }

  if (estimate > snapshot.remainingAiBudgetUsd) {
    await recordDecision(db, { feature, agentId, userId, estimatedCostUsd: estimate, allowed: false, reason: 'profit_margin_protection', metadata });
    return { allowed: false, reason: 'profit_margin_protection', snapshot };
  }

  const reservationId = uuidv4();
  await db.collection('ai_cost_reservations').insertOne({
    id: reservationId,
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

  await recordDecision(db, { feature, agentId, userId, estimatedCostUsd: estimate, allowed: true, reason: 'within_profit_budget', metadata });
  return { allowed: true, reservationId, reason: 'within_profit_budget', snapshot };
}

export async function settleAiSpend({ db, reservationId = null, feature, agentId = null, userId = null, actualCostUsd, provider = null, model = null, metadata = {} }) {
  if (!db) return;
  const cost = Math.max(0, finite(actualCostUsd, 0));
  const now = new Date();

  if (reservationId) {
    await db.collection('ai_cost_reservations').updateOne(
      { id: reservationId, status: 'reserved' },
      { $set: { status: 'settled', settledAt: now, actualCostUsd: cost } },
    ).catch(() => null);
  }

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
}

export async function releaseAiSpendReservation({ db, reservationId, reason = 'released' }) {
  if (!db || !reservationId) return;
  await db.collection('ai_cost_reservations').updateOne(
    { id: reservationId, status: 'reserved' },
    { $set: { status: 'released', releaseReason: reason, releasedAt: new Date() } },
  ).catch(() => null);
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
