import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { releaseReservation } from '@/lib/protection-reservations';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { reservationId } = await request.json().catch(() => ({}));
  const db = await getDb();
  const row = await db.collection('upload_reservations').findOne({ id: reservationId, userId: user.id, status: 'reserved' });
  if (row) await releaseReservation(db, reservationId, 'cancelled');
  return NextResponse.json({ ok: true });
}
