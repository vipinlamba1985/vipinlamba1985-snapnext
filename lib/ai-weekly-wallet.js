import { v4 as uuidv4 } from 'uuid';
import { getEffectivePlan } from '@/lib/entitlements';
import { getPlan } from '@/lib/plans';
import { resolveFamilyWalletIdentity } from '@/lib/family';

const RESERVATION_TTL_MS = 30 * 60 * 1000;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mondayUtc(date = new Date()) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + offset);
  return value;
}

function nextMondayUtc(date = new Date()) {
  const start = mondayUtc(date);
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

export function aiWalletWeekKey(date = new Date()) {
  return mondayUtc(date).toISOString().slice(0, 10);
}

export function weeklyAiWalletLimitUsd(planId) {
  const key = String(planId || 'free').toLowerCase();
  const envKey = `AI_WEEKLY_WALLET_${key.toUpperCase()}_USD`;
  const fallback = Math.max(0, finite(getPlan(key)?.weeklyExternalAiUsd, 0));
  return Math.max(0, finite(process.env[envKey], fallback));
}

async function expireReservations(db, now = new Date()) {
  const expired = await db.collection('ai_wallet_reservations').find({ status: 'reserved', expiresAt: { $lte: now } }).limit(200).toArray().catch(() => []);
  for (const reservation of expired) {
    const claimed = await db.collection('ai_wallet_reservations').findOneAndUpdate({ id: reservation.id, status: 'reserved' }, { $set: { status: 'expired', expiredAt: now } }, { returnDocument: 'before' }).catch(() => null);
    if (!claimed) continue;
    await db.collection('ai_weekly_wallets').updateOne({ id: reservation.walletId }, { $inc: { reservedUsd: -Math.max(0, finite(reservation.reservedCostUsd, 0)) }, $set: { updatedAt: now } }).catch(() => null);
  }
}

export async function getUserAiWalletSnapshot({ db, user, request = null, now = new Date() }) {
  if (!db || !user?.id) throw new Error('Database and user are required for AI wallet.');
  const familyIdentity = await resolveFamilyWalletIdentity(db, user);
  const plan = familyIdentity.plan || getEffectivePlan(user, request);
  const walletOwnerId = familyIdentity.walletOwnerId || user.id;
  const weekStart = mondayUtc(now);
  const weekEnd = nextMondayUtc(now);
  const weekKey = aiWalletWeekKey(now);
  const walletId = `${walletOwnerId}:${weekKey}`;
  const weeklyLimitUsd = weeklyAiWalletLimitUsd(plan);

  await expireReservations(db, now);
  await db.collection('ai_weekly_wallets').updateOne(
    { id: walletId },
    {
      $setOnInsert: { id: walletId, userId: walletOwnerId, walletOwnerId, familyId: familyIdentity.family?.id || null, weekKey, weekStart, weekEnd, spentUsd: 0, reservedUsd: 0, createdAt: now },
      $set: { plan, limitUsd: weeklyLimitUsd, familyId: familyIdentity.family?.id || null, updatedAt: now },
    },
    { upsert: true },
  );

  const wallet = await db.collection('ai_weekly_wallets').findOne({ id: walletId });
  const spentUsd = Math.max(0, finite(wallet?.spentUsd, 0));
  const reservedUsd = Math.max(0, finite(wallet?.reservedUsd, 0));
  const remainingUsd = Math.max(0, weeklyLimitUsd - spentUsd - reservedUsd);

  return {
    walletId,
    userId: user.id,
    walletOwnerId,
    familyId: familyIdentity.family?.id || null,
    sharedFamilyWallet: Boolean(familyIdentity.family),
    plan,
    weekKey,
    weekStart,
    weekEnd,
    weeklyLimitUsd: Number(weeklyLimitUsd.toFixed(6)),
    spentUsd: Number(spentUsd.toFixed(6)),
    reservedUsd: Number(reservedUsd.toFixed(6)),
    remainingUsd: Number(remainingUsd.toFixed(6)),
    externalAiEnabled: weeklyLimitUsd > 0,
    resetsAt: weekEnd,
  };
}

export async function reserveUserAiWallet({ db, user, request = null, feature, estimatedCostUsd, metadata = {} }) {
  const estimate = Math.max(0, finite(estimatedCostUsd, 0));
  if (estimate <= 0) return { allowed: true, reservationId: null, reason: 'no_external_ai_cost' };
  const snapshot = await getUserAiWalletSnapshot({ db, user, request });
  if (!snapshot.externalAiEnabled) {
    await recordWalletDecision(db, { userId: user.id, walletOwnerId: snapshot.walletOwnerId, familyId: snapshot.familyId, plan: snapshot.plan, feature, estimatedCostUsd: estimate, allowed: false, reason: 'external_ai_not_in_plan', metadata });
    return { allowed: false, reason: 'external_ai_not_in_plan', snapshot };
  }

  const now = new Date();
  const wallet = await db.collection('ai_weekly_wallets').findOneAndUpdate(
    { id: snapshot.walletId, $expr: { $lte: [{ $add: [{ $ifNull: ['$spentUsd', 0] }, { $ifNull: ['$reservedUsd', 0] }, estimate] }, { $ifNull: ['$limitUsd', 0] }] } },
    { $inc: { reservedUsd: estimate }, $set: { updatedAt: now } },
    { returnDocument: 'after' },
  );

  if (!wallet) {
    const latest = await getUserAiWalletSnapshot({ db, user, request });
    await recordWalletDecision(db, { userId: user.id, walletOwnerId: latest.walletOwnerId, familyId: latest.familyId, plan: latest.plan, feature, estimatedCostUsd: estimate, allowed: false, reason: 'weekly_wallet_exhausted', metadata });
    return { allowed: false, reason: 'weekly_wallet_exhausted', snapshot: latest };
  }

  const reservationId = uuidv4();
  await db.collection('ai_wallet_reservations').insertOne({ id: reservationId, walletId: snapshot.walletId, userId: user.id, walletOwnerId: snapshot.walletOwnerId, familyId: snapshot.familyId, plan: snapshot.plan, feature, reservedCostUsd: estimate, status: 'reserved', metadata, createdAt: now, expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS) });
  await recordWalletDecision(db, { userId: user.id, walletOwnerId: snapshot.walletOwnerId, familyId: snapshot.familyId, plan: snapshot.plan, feature, estimatedCostUsd: estimate, allowed: true, reason: 'within_weekly_wallet', metadata });
  return { allowed: true, reservationId, reason: 'within_weekly_wallet', snapshot };
}

export async function settleUserAiWallet({ db, reservationId, actualCostUsd, metadata = {} }) {
  if (!db || !reservationId) return;
  const now = new Date();
  const actual = Math.max(0, finite(actualCostUsd, 0));
  const reservation = await db.collection('ai_wallet_reservations').findOneAndUpdate({ id: reservationId, status: 'reserved' }, { $set: { status: 'settled', actualCostUsd: actual, settlementMetadata: metadata, settledAt: now } }, { returnDocument: 'before' });
  if (!reservation) return;
  const reserved = Math.max(0, finite(reservation.reservedCostUsd, 0));
  await db.collection('ai_weekly_wallets').updateOne({ id: reservation.walletId }, { $inc: { reservedUsd: -reserved, spentUsd: actual }, $set: { updatedAt: now } });
  await db.collection('ai_wallet_ledger').insertOne({ id: uuidv4(), walletId: reservation.walletId, userId: reservation.userId, walletOwnerId: reservation.walletOwnerId, familyId: reservation.familyId, plan: reservation.plan, feature: reservation.feature, reservedCostUsd: reserved, actualCostUsd: actual, metadata, createdAt: now });
}

export async function releaseUserAiWalletReservation({ db, reservationId, reason = 'released' }) {
  if (!db || !reservationId) return;
  const now = new Date();
  const reservation = await db.collection('ai_wallet_reservations').findOneAndUpdate({ id: reservationId, status: 'reserved' }, { $set: { status: 'released', releaseReason: reason, releasedAt: now } }, { returnDocument: 'before' });
  if (!reservation) return;
  await db.collection('ai_weekly_wallets').updateOne({ id: reservation.walletId }, { $inc: { reservedUsd: -Math.max(0, finite(reservation.reservedCostUsd, 0)) }, $set: { updatedAt: now } });
}

async function recordWalletDecision(db, row) {
  await db.collection('ai_wallet_decisions').insertOne({ id: uuidv4(), ...row, createdAt: new Date() }).catch(() => null);
}
