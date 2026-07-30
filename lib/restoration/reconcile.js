import { releaseRestorationUnits } from './wallet.js';

function ttlMs() {
  const minutes = Number(process.env.RESTORATION_RESERVATION_TTL_MINUTES || 15);
  return Math.max(5, Number.isFinite(minutes) ? minutes : 15) * 60 * 1000;
}

export function restorationReservationCutoff(now = new Date()) {
  return new Date(now.getTime() - ttlMs());
}

export async function releaseStaleRestorationReservations({ db, userId, now = new Date() }) {
  if (!db || !userId) return { released: 0 };
  const cutoff = restorationReservationCutoff(now);
  const stale = await db.collection('restoration_credit_reservations')
    .find({ userId, status: 'reserved', createdAt: { $lte: cutoff } })
    .sort({ createdAt: 1 })
    .limit(20)
    .toArray();

  let released = 0;
  for (const reservation of stale) {
    const wallet = await releaseRestorationUnits({
      db,
      reservationId: reservation.id,
      reason: 'stale_restoration_recovered',
    });
    if (!wallet) continue;
    released += 1;
    const jobId = reservation.metadata?.jobId;
    if (jobId) {
      await db.collection('photo_restoration_jobs').updateOne(
        { id: jobId, userId, status: 'processing' },
        {
          $set: {
            status: 'failed',
            failureCode: 'stale_restoration_recovered',
            recoveredAt: now,
            updatedAt: now,
          },
        },
      );
    }
  }
  return { released, cutoff };
}

export async function findActiveRestorationJob({ db, userId, now = new Date() }) {
  if (!db || !userId) return null;
  const cutoff = restorationReservationCutoff(now);
  return db.collection('photo_restoration_jobs').findOne({
    userId,
    status: 'processing',
    updatedAt: { $gt: cutoff },
  });
}
