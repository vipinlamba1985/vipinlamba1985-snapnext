import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { DEFAULT_THUMBNAIL_SIZE } from '@/lib/thumbnails';
import { getOrCreateThumbnail, getVideoPoster } from '@/lib/thumbnails.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function inferImageType(doc = {}) {
  const stored = String(doc.mime || '').trim().toLowerCase();
  if (stored.startsWith('image/')) return stored;

  const value = `${doc.name || ''} ${doc.storageKey || ''}`.toLowerCase();
  if (/\.jpe?g(?:\s|$)/.test(value)) return 'image/jpeg';
  if (/\.png(?:\s|$)/.test(value)) return 'image/png';
  if (/\.webp(?:\s|$)/.test(value)) return 'image/webp';
  if (/\.heic(?:\s|$)/.test(value)) return 'image/heic';
  if (/\.heif(?:\s|$)/.test(value)) return 'image/heif';
  if (/\.avif(?:\s|$)/.test(value)) return 'image/avif';
  if (/\.gif(?:\s|$)/.test(value)) return 'image/gif';
  return 'application/octet-stream';
}

function imageHeaders({ contentType, contentLength, cached = false }) {
  const headers = new Headers({
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': 'inline',
    // A cached derivative is immutable — its key carries the version and width,
    // so it can be held for a year instead of re-fetched hourly. That long hold
    // is most of what stops the originals being read over and over.
    'Cache-Control': cached
      ? 'private, max-age=31536000, immutable'
      : 'private, max-age=3600, stale-while-revalidate=86400',
    'X-Content-Type-Options': 'nosniff',
  });
  if (Number.isFinite(Number(contentLength))) headers.set('Content-Length', String(contentLength));
  return headers;
}

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = await getDb();
  const doc = await db.collection('media').findOne({
    id: String(id || ''),
    userId: user.id,
    trashed: { $ne: true },
  });

  if (!doc) return NextResponse.json({ error: 'Media not found' }, { status: 404 });

  try {
    // Videos never fall through to original storage here. A grid request may
    // read only a pre-generated poster derivative; if none exists the client
    // keeps its lightweight fallback tile.
    if (doc.kind === 'video') {
      const poster = await getVideoPoster({ doc, userId: user.id });
      if (!poster) {
        return NextResponse.json(
          { error: 'Video poster not available' },
          { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
        );
      }
      return new Response(poster.buffer, {
        status: 200,
        headers: imageHeaders({
          contentType: 'image/jpeg',
          contentLength: poster.buffer.length,
          cached: true,
        }),
      });
    }

    if (doc.kind !== 'photo') return NextResponse.json({ error: 'Thumbnail source is not a photo' }, { status: 415 });
    const size = new URL(request.url).searchParams.get('w');

    // Read-through cache. The original is fetched only on a miss, so a warm
    // thumbnail never touches it — which is what lets originals move to cold
    // storage without ordinary browsing paying a retrieval fee.
    const thumbnail = await getOrCreateThumbnail({
      doc,
      userId: user.id,
      size: size ? Number(size) : DEFAULT_THUMBNAIL_SIZE,
      source: () => storage.read({ provider: doc.provider || 'local', storageKey: doc.storageKey }),
    });

    if (thumbnail) {
      return new Response(thumbnail.buffer, {
        status: 200,
        headers: imageHeaders({
          contentType: 'image/jpeg',
          contentLength: thumbnail.buffer.length,
          cached: thumbnail.cached,
        }),
      });
    }

    // Anything a photo thumbnail cannot be generated from still renders, by
    // streaming the stored image as before rather than showing a broken tile.
    if ((doc.provider || 'local') === 's3') {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        } : undefined,
      });
      const object = await client.send(new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: doc.storageKey,
      }));
      if (!object.Body) throw new Error('S3 returned an empty image body');

      const stream = typeof object.Body.transformToWebStream === 'function'
        ? object.Body.transformToWebStream()
        : Readable.toWeb(object.Body);

      return new Response(stream, {
        status: 200,
        headers: imageHeaders({
          contentType: object.ContentType || inferImageType(doc),
          contentLength: object.ContentLength,
        }),
      });
    }

    const buffer = await storage.read({ provider: doc.provider || 'local', storageKey: doc.storageKey });
    return new Response(buffer, {
      status: 200,
      headers: imageHeaders({ contentType: inferImageType(doc), contentLength: buffer.length }),
    });
  } catch (error) {
    console.error('[media-thumbnail] stream failed', doc.id, doc.provider, error?.name, error?.message);
    return NextResponse.json({ error: 'Thumbnail unavailable' }, { status: 502 });
  }
}
