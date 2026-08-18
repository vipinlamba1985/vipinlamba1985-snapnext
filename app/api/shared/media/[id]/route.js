import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { canViewOwnersResource } from '@/lib/trusted-circle/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function safeFilename(name = 'file') {
  return String(name || 'file').replace(/["\r\n]/g, '').slice(0, 180) || 'file';
}

function ownerIdOf(row = {}) {
  return row.ownerUserId || row.ownerId || null;
}

function recipientIdOf(row = {}) {
  return row.recipientUserId || row.userId || null;
}

async function hasDirectShare(db, viewerId, media) {
  const photoRow = await db.collection('shared_photos').findOne({
    mediaId: media.id,
    $or: [{ recipientUserId: viewerId }, { userId: viewerId }],
  });
  if (photoRow && ownerIdOf(photoRow) === media.userId && recipientIdOf(photoRow) === viewerId) {
    if (await canViewOwnersResource(db, viewerId, media.userId, 'shareSharedPhotos')) return true;
  }

  const memoryRow = await db.collection('shared_memories').findOne({
    mediaIds: media.id,
    $or: [{ recipientUserId: viewerId }, { userId: viewerId }],
  });
  if (memoryRow && ownerIdOf(memoryRow) === media.userId && recipientIdOf(memoryRow) === viewerId) {
    if (await canViewOwnersResource(db, viewerId, media.userId, 'shareMemories')) return true;
  }
  return false;
}

async function hasAlbumShare(db, viewerId, media) {
  const links = await db.collection('shared_album_media').find({ mediaId: media.id }).project({ _id: 0, albumId: 1 }).limit(30).toArray();
  if (!links.length) return false;
  const albumIds = [...new Set(links.map(link => link.albumId).filter(Boolean))];
  const memberships = await db.collection('shared_album_members').find({
    albumId: { $in: albumIds },
    favoriteUserId: viewerId,
  }).project({ _id: 0, albumId: 1 }).toArray();
  if (!memberships.length) return false;
  const memberAlbumIds = memberships.map(row => row.albumId);
  const albums = await db.collection('shared_albums').find({ id: { $in: memberAlbumIds } }).project({ _id: 0, id: 1, ownerUserId: 1, ownerId: 1 }).toArray();
  const ownedAlbum = albums.find(album => ownerIdOf(album) === media.userId);
  if (!ownedAlbum) return false;
  return canViewOwnersResource(db, viewerId, media.userId, 'shareAlbums');
}

async function canViewSharedMedia(db, viewerId, media) {
  if (media.userId === viewerId) return true;
  if (await hasDirectShare(db, viewerId, media)) return true;
  return hasAlbumShare(db, viewerId, media);
}

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = await context.params;
  const mediaId = String(params?.id || '').trim();
  if (!mediaId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = await getDb();
  const media = await db.collection('media').findOne({ id: mediaId, trashed: { $ne: true } });
  if (!media) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!await canViewSharedMedia(db, user.id, media)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const download = new URL(request.url).searchParams.get('dl') === '1';
  const provider = media.provider || 'local';
  if (provider === 's3') {
    try {
      const signed = await storage.getReadUrl({
        provider: 's3',
        storageKey: media.storageKey,
        expiresSec: 600,
        filename: download ? safeFilename(media.name) : null,
        contentType: media.mime || null,
      });
      return NextResponse.redirect(signed, 302);
    } catch (error) {
      console.error('[shared-media] signed URL failed', mediaId, error?.message);
      return NextResponse.json({ error: 'Storage unavailable' }, { status: 502 });
    }
  }

  try {
    const buffer = await storage.read({ provider: 'local', storageKey: media.storageKey });
    const headers = {
      'Content-Type': media.mime || 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    };
    if (download) headers['Content-Disposition'] = `attachment; filename="${safeFilename(media.name)}"`;
    return new NextResponse(buffer, { status: 200, headers });
  } catch (error) {
    console.error('[shared-media] local read failed', mediaId, error?.message);
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 });
  }
}
