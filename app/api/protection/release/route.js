import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import {
  MAX_RELEASE_RESERVATIONS,
  normalizeServerReservationIds,
  releaseReservations,
} from '@/lib/protection-reservations';

export const runtime = 'nodejs';

const RELEASE_REASONS = new Set([
  'cancelled',
  'selection_replaced',
  'restart',
  'preflight_failed',
  'stale_preflight',
  'page_exit',
  'queue_cleanup',
]);

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const supplied = Array.isArray(body.reservationIds)
    ? body.reservationIds
    : body.reservationId
      ? [body.reservationId]
      : [];

  if (supplied.length > MAX_RELEASE_RESERVATIONS) {
    return NextResponse.json({ error: `At most ${MAX_RELEASE_RESERVATIONS} reservations may be released at once.` }, { status: 400 });
  }
  if (supplied.some((value) => typeof value !== 'string')) {
    return NextResponse.json({ error: 'Reservation ids must be strings.' }, { status: 400 });
  }

  const reservationIds = normalizeServerReservationIds(supplied);
  const hasMalformed = supplied.some((value) => {
    const id = value.trim();
    return !id || id.length > 128 || !/^[A-Za-z0-9_-]+$/.test(id);
  });
  if (hasMalformed || !reservationIds.length) {
    return NextResponse.json({ error: 'A valid reservation id is required.' }, { status: 400 });
  }

  const reason = RELEASE_REASONS.has(body.reason) ? body.reason : 'cancelled';
  const db = await getDb();
  const result = await releaseReservations(db, {
    reservationIds,
    userId: user.id,
    status: reason,
  });

  return NextResponse.json({
    ok: true,
    requested: result.requested,
    released: result.releasedIds.length,
    ignored: result.ignoredIds.length,
  });
}
