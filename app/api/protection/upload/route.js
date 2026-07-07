import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { getReservedUpload, commitReservedUpload } from '@/lib/protection-commit';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const form = await request.formData();
  const reservationId = String(form.get('reservationId') || '');
  const file = form.get('file');
  if (!reservationId || !file) return NextResponse.json({ error: 'Reservation and file are required' }, { status: 400 });

  const db = await getDb();
  const reservation = await getReservedUpload(db, user.id, reservationId);
  if (!reservation) return NextResponse.json({ error: 'Reservation expired or already completed' }, { status: 409 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  if (buffer.length !== reservation.bytes || hash !== reservation.hash) {
    return NextResponse.json({ error: 'Selected file no longer matches its protection plan' }, { status: 409 });
  }

  try {
    const stored = await storage.save({ userId: user.id, fileId: reservation.fileId, buffer, name: reservation.name, mime: reservation.mime });
    const result = await commitReservedUpload({ db, user, reservation, provider: stored.provider, storageKey: stored.storageKey });
    if (result.duplicate) await storage.delete({ provider: stored.provider, storageKey: stored.storageKey });
    return NextResponse.json({ ok: true, duplicate: result.duplicate, item: result.item });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 502 });
  }
}
