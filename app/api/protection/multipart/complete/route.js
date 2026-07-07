import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { getReservedUpload, commitReservedUpload } from '@/lib/protection-commit';
import { verifyProtectedObject } from '@/lib/protection-verify';
import { listUploadedParts } from '@/lib/multipart-s3-status';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { reservationId } = await request.json().catch(() => ({}));
  const db = await getDb();
  const row = await getReservedUpload(db, user.id, reservationId);
  if (!row || row.uploadMode !== 'multipart') return NextResponse.json({ error: 'Multipart session unavailable' }, { status: 409 });

  const uploaded = await listUploadedParts({ storageKey: row.storageKey, uploadId: row.multipartUploadId });
  if (uploaded.length !== Number(row.multipartTotalParts || 0)) {
    return NextResponse.json({ error: 'Multipart upload is incomplete', uploadedParts: uploaded.length, totalParts: row.multipartTotalParts }, { status: 409 });
  }
  const parts = uploaded.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber }));
  await storage.completeMultipartUpload({ storageKey: row.storageKey, uploadId: row.multipartUploadId, parts });
  await verifyProtectedObject({ provider: 's3', storageKey: row.storageKey, expectedBytes: row.bytes });
  const result = await commitReservedUpload({ db, user, reservation: row, provider: 's3', storageKey: row.storageKey });
  if (result.duplicate) await storage.delete({ provider: 's3', storageKey: row.storageKey });
  return NextResponse.json({ ok: true, duplicate: result.duplicate, item: result.item });
}
