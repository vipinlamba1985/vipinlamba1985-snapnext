import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { listUploadedParts } from '@/lib/multipart-s3-status';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { reservationId } = await request.json().catch(() => ({}));
  const db = await getDb();
  const row = await db.collection('upload_reservations').findOne({ id: reservationId, userId: user.id, status: 'reserved', uploadMode: 'multipart' });
  if (!row?.storageKey || !row?.multipartUploadId) return NextResponse.json({ error: 'Multipart session unavailable' }, { status: 409 });
  const parts = await listUploadedParts({ storageKey: row.storageKey, uploadId: row.multipartUploadId });
  return NextResponse.json({
    reservationId: row.id,
    partSize: row.multipartPartSize,
    totalParts: row.multipartTotalParts,
    expiresAt: row.expiresAt,
    parts,
  });
}
