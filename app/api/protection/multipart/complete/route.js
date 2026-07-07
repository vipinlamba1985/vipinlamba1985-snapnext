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
  const { reservationId, parts } = await request.json().catch(() => ({}));
  const db = await getDb();
  const row = await getReservedUpload(db, user.id, reservationId);
  if (!row || row.uploadMode !== 'multipart') return NextResponse.json({ error: 'Multipart session unavailable' }, { status: 409 });
  const cleanParts = Array.isArray(parts) ? parts.map((part) => ({ ETag: String(part.etag || ''), PartNumber: Number(part.partNumber || 0) })).filter((part) => part.ETag && part.PartNumber > 0).sort((a, b) => a.PartNumber - b.PartNumber) : [];
  if (cleanParts.length !== Number(row.multipartTotalParts || 0)) return NextResponse.json({ error: 'Multipart upload is incomplete' }, { status: 409 });
  await storage.completeMultipartUpload({ storageKey: row.storageKey, uploadId: row.multipartUploadId, parts: cleanParts });
  await verifyProtectedObject({ provider: 's3', storageKey: row.storageKey, expectedBytes: row.bytes });
  const result = await commitReservedUpload({ db, user, reservation: row, provider: 's3', storageKey: row.storageKey });
  if (result.duplicate) await storage.delete({ provider: 's3', storageKey: row.storageKey });
  return NextResponse.json({ ok: true, duplicate: result.duplicate, item: result.item });
}
