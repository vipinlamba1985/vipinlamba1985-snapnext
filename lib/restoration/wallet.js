import { randomUUID } from 'crypto';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function ensureWallet(db, userId, now = new Date()) {
  await db.collection('restoration_wallets').updateOne(
    { userId },
    {
      $setOnInsert: {
        id: randomUUID(),
        userId,
        purchasedUnits: 0,
        availableUnits: 0,
        reservedUnits: 0,
        usedUnits: 0,
        revokedReservedUnits: 0,
        refundedUsedUnits: 0,
        grantIds: [],
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true },
  );
}

export async function getRestorationWallet(db, userId) {
  if (!db || !userId) throw new Error('Database and user are required for restoration wallet.');
  await ensureWallet(db, userId);
  const wallet = await db.collection('restoration_wallets').findOne({ userId });
  return {
    userId,
    purchasedUnits: Math.max(0, finite(wallet?.purchasedUnits)),
    availableUnits: Math.max(0, finite(wallet?.availableUnits)),
    reservedUnits: Math.max(0, finite(wallet?.reservedUnits)),
    usedUnits: Math.max(0, finite(wallet?.usedUnits)),
    updatedAt: wallet?.updatedAt || null,
  };
}

export async function grantRestorationPack({
  db,
  userId,
  pack,
  grantId,
  provider = 'stripe',
  paymentReference = null,
  amount = null,
  currency = null,
}) {
  if (!db || !userId || !pack?.id || !grantId) throw new Error('A valid restoration grant is required.');
  const now = new Date();
  await ensureWallet(db, userId, now);

  const applied = await db.collection('restoration_wallets').updateOne(
    { userId, grantIds: { $ne: grantId } },
    {
      $inc: {
        purchasedUnits: pack.units,
        availableUnits: pack.units,
      },
      $addToSet: { grantIds: grantId },
      $set: { updatedAt: now },
    },
  );

  await db.collection('restoration_purchases').updateOne(
    { grantId },
    {
      $setOnInsert: {
        id: randomUUID(),
        grantId,
        userId,
        packId: pack.id,
        units: pack.units,
        provider,
        paymentReference,
        amount,
        currency,
        status: 'granted',
        grantedAt: now,
        createdAt: now,
      },
      $set: {
        lastWebhookSeenAt: now,
        walletGrantApplied: applied.modifiedCount > 0,
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  return getRestorationWallet(db, userId);
}

export async function reserveRestorationUnits({ db, userId, reservationId, units, metadata = {} }) {
  if (!db || !userId || !reservationId) throw new Error('A restoration reservation requires a user and reservation id.');
  const required = Math.max(1, Math.floor(finite(units, 1)));
  const existing = await db.collection('restoration_credit_reservations').findOne({ id: reservationId });
  if (existing) {
    return {
      ok: ['reserved', 'settled'].includes(existing.status),
      reservation: existing,
      wallet: await getRestorationWallet(db, userId),
    };
  }

  const now = new Date();
  await ensureWallet(db, userId, now);
  const wallet = await db.collection('restoration_wallets').findOneAndUpdate(
    { userId, availableUnits: { $gte: required } },
    {
      $inc: { availableUnits: -required, reservedUnits: required },
      $set: { updatedAt: now },
    },
    { returnDocument: 'after' },
  );

  if (!wallet) {
    return {
      ok: false,
      code: 'restoration_credits_required',
      wallet: await getRestorationWallet(db, userId),
      requiredUnits: required,
    };
  }

  try {
    await db.collection('restoration_credit_reservations').insertOne({
      id: reservationId,
      userId,
      units: required,
      status: 'reserved',
      metadata,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    await db.collection('restoration_wallets').updateOne(
      { userId },
      { $inc: { availableUnits: required, reservedUnits: -required }, $set: { updatedAt: new Date() } },
    ).catch(() => null);
    throw error;
  }

  return {
    ok: true,
    reservation: { id: reservationId, userId, units: required, status: 'reserved' },
    wallet: await getRestorationWallet(db, userId),
  };
}

export async function settleRestorationUnits({ db, reservationId, jobId = null }) {
  if (!db || !reservationId) return null;
  const now = new Date();
  const reservation = await db.collection('restoration_credit_reservations').findOneAndUpdate(
    { id: reservationId, status: 'reserved' },
    { $set: { status: 'settled', jobId, settledAt: now, updatedAt: now } },
    { returnDocument: 'before' },
  );
  if (!reservation) return null;
  const units = Math.max(1, Math.floor(finite(reservation.units, 1)));
  await db.collection('restoration_wallets').updateOne(
    { userId: reservation.userId },
    [{
      $set: {
        reservedUnits: { $max: [0, { $subtract: [{ $ifNull: ['$reservedUnits', 0] }, units] }] },
        usedUnits: { $add: [{ $ifNull: ['$usedUnits', 0] }, units] },
        refundedUsedUnits: {
          $add: [
            { $ifNull: ['$refundedUsedUnits', 0] },
            { $min: [{ $ifNull: ['$revokedReservedUnits', 0] }, units] },
          ],
        },
        revokedReservedUnits: {
          $max: [0, { $subtract: [{ $ifNull: ['$revokedReservedUnits', 0] }, units] }],
        },
        updatedAt: now,
      },
    }],
  );
  return getRestorationWallet(db, reservation.userId);
}

export async function releaseRestorationUnits({ db, reservationId, reason = 'released' }) {
  if (!db || !reservationId) return null;
  const now = new Date();
  const reservation = await db.collection('restoration_credit_reservations').findOneAndUpdate(
    { id: reservationId, status: 'reserved' },
    { $set: { status: 'released', releaseReason: reason, releasedAt: now, updatedAt: now } },
    { returnDocument: 'before' },
  );
  if (!reservation) return null;
  const units = Math.max(1, Math.floor(finite(reservation.units, 1)));
  await db.collection('restoration_wallets').updateOne(
    { userId: reservation.userId },
    [{
      $set: {
        reservedUnits: { $max: [0, { $subtract: [{ $ifNull: ['$reservedUnits', 0] }, units] }] },
        availableUnits: {
          $add: [
            { $ifNull: ['$availableUnits', 0] },
            { $max: [0, { $subtract: [units, { $min: [{ $ifNull: ['$revokedReservedUnits', 0] }, units] }] }] },
          ],
        },
        revokedReservedUnits: {
          $max: [0, { $subtract: [{ $ifNull: ['$revokedReservedUnits', 0] }, units] }],
        },
        updatedAt: now,
      },
    }],
  );
  return getRestorationWallet(db, reservation.userId);
}

export async function revokeRestorationPurchase({ db, paymentReference, reason = 'refunded' }) {
  if (!db || !paymentReference) return null;
  const now = new Date();
  const purchase = await db.collection('restoration_purchases').findOneAndUpdate(
    { paymentReference, status: 'granted' },
    { $set: { status: 'revoked', revokeReason: reason, revokedAt: now, updatedAt: now } },
    { returnDocument: 'before' },
  );
  if (!purchase) return null;

  const units = Math.max(0, Math.floor(finite(purchase.units)));
  const walletBefore = await db.collection('restoration_wallets').findOneAndUpdate(
    { userId: purchase.userId },
    [{
      $set: {
        purchasedUnits: { $max: [0, { $subtract: [{ $ifNull: ['$purchasedUnits', 0] }, units] }] },
        availableUnits: { $max: [0, { $subtract: [{ $ifNull: ['$availableUnits', 0] }, units] }] },
        revokedReservedUnits: {
          $add: [
            { $ifNull: ['$revokedReservedUnits', 0] },
            {
              $min: [
                { $ifNull: ['$reservedUnits', 0] },
                { $max: [0, { $subtract: [units, { $ifNull: ['$availableUnits', 0] }] }] },
              ],
            },
          ],
        },
        refundedUsedUnits: {
          $add: [
            { $ifNull: ['$refundedUsedUnits', 0] },
            {
              $max: [
                0,
                {
                  $subtract: [
                    { $max: [0, { $subtract: [units, { $ifNull: ['$availableUnits', 0] }] }] },
                    {
                      $min: [
                        { $ifNull: ['$reservedUnits', 0] },
                        { $max: [0, { $subtract: [units, { $ifNull: ['$availableUnits', 0] }] }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        updatedAt: now,
      },
    }],
    { returnDocument: 'before' },
  );

  const availableBefore = Math.max(0, finite(walletBefore?.availableUnits));
  const reservedBefore = Math.max(0, finite(walletBefore?.reservedUnits));
  const revokedAvailableUnits = Math.min(availableBefore, units);
  const revokedReservedUnits = Math.min(reservedBefore, Math.max(0, units - revokedAvailableUnits));
  const refundedUsedUnits = Math.max(0, units - revokedAvailableUnits - revokedReservedUnits);
  await db.collection('restoration_purchases').updateOne(
    { id: purchase.id },
    {
      $set: {
        revokedAvailableUnits,
        revokedReservedUnits,
        refundedUsedUnits,
        updatedAt: now,
      },
    },
  );
  return getRestorationWallet(db, purchase.userId);
}
