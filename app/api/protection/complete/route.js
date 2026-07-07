import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { getReservedUpload, commitReservedUpload } from '@/lib/protection-commit';
import { verifyProtectedObject } from '@/lib/protection-verify';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { reservationId } = await request.json().catch(() => ({}));
  if (!reservationId) return NextResponse.json({ error: 'Reservation required' }, { status: 400 });

  const db = await getDb();
  const reservation = await getReservedUpload(db, user.id, reservationId);
  if (!reservation) return NextResponse.json({ error: 'Reservation expired or already completed' }, { status: 409 });
  if (reservation.uploadMode !== 'direct' || !reservation.storageKey) return NextResponse.json({ error: 'Not a direct upload reservation' }, { status: 400 });

  try {
    await verifyProtectedObject({ provider: 's3', storageKey: reservation.storageKey, expectedBytes: reservation.bytes });
    const result = await commitReservedUpload({ db, user, reservation, provider: 's3', storageKey: reservation.storageKey });
    if (result.duplicate) await storage.delete({ provider: 's3', storageKey: reservation.storageKey });
    return NextResponse.json({ ok: true, duplicate: result.duplicate, item: result.item });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Could not verify upload' }, { status: 502 });
  }
}
