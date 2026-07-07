import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { reservationId, partNumber } = await request.json().catch(() => ({}));
  const part = Number(partNumber || 0);
  if (!reservationId || part < 1 || part > 10000) return NextResponse.json({ error: 'Invalid multipart part' }, { status: 400 });
  const db = await getDb();
  const row = await db.collection('upload_reservations').findOne({ id: reservationId, userId: user.id, status: 'reserved', uploadMode: 'multipart' });
  if (!row || !row.multipartUploadId || !row.storageKey) return NextResponse.json({ error: 'Multipart session unavailable' }, { status: 409 });
  if (part > Number(row.multipartTotalParts || 0)) return NextResponse.json({ error: 'Part outside session' }, { status: 400 });
  const url = await storage.signUploadPartUrl({ storageKey: row.storageKey, uploadId: row.multipartUploadId, partNumber: part });
  return NextResponse.json({ url, partNumber: part });
}
