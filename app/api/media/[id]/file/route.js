import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function safeFilename(name = 'file') {
  return String(name || 'file').replace(/["\r\n]/g, '').slice(0, 180) || 'file';
}

function privateHeaders(contentType) {
  return {
    'Content-Type': contentType || 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
}

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const mediaId = String(id || '');
  const download = new URL(request.url).searchParams.get('dl') === '1';
  const db = await getDb();
  const doc = await db.collection('media').findOne({ id: mediaId, userId: user.id });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const provider = doc.provider || 'local';
  if (provider === 's3') {
    try {
      const signed = await storage.getReadUrl({
        provider: 's3',
        storageKey: doc.storageKey,
        expiresSec: 600,
        filename: download ? safeFilename(doc.name) : null,
        contentType: doc.mime || null,
      });
      return NextResponse.redirect(signed, 302);
    } catch (error) {
      console.error('[media-file] signed URL failed', mediaId, error?.message);
      return NextResponse.json({ error: 'Storage unavailable' }, { status: 502 });
    }
  }

  try {
    const buffer = await storage.read({ provider: 'local', storageKey: doc.storageKey });
    const headers = privateHeaders(doc.mime);
    if (download) headers['Content-Disposition'] = `attachment; filename="${safeFilename(doc.name)}"`;
    return new NextResponse(buffer, { status: 200, headers });
  } catch (error) {
    console.error('[media-file] local read failed', mediaId, error?.message);
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }
}
