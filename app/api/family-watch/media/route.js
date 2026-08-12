import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { storage } from '@/lib/storage';
import { familyWatchSecretMatches } from '@/lib/family-watch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const NO_STORE = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function fail(message, status = 403) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

export async function GET(request) {
  const url = new URL(request.url);
  const id = String(url.searchParams.get('session') || '');
  const slot = Number.parseInt(url.searchParams.get('slot') || '', 10);
  const token = String(url.searchParams.get('token') || '');
  if (!ID_PATTERN.test(id) || !Number.isInteger(slot) || slot < 0 || slot > 39 || !token) {
    return fail('Invalid family watch media request.', 400);
  }

  const db = await getDb();
  const session = await db.collection('family_watch_sessions').findOne({ id, status: 'approved', expiresAt: { $gt: new Date() } });
  const expectedHash = session?.mediaAccessHashes?.[slot];
  if (!session || !expectedHash || !familyWatchSecretMatches(token, expectedHash)) return fail('Family watch media access expired.');

  const mediaId = session.mediaIds?.[slot];
  if (!mediaId) return fail('Memory is unavailable.', 404);
  const media = await db.collection('media').findOne({
    userId: session.userId,
    id: mediaId,
    trashed: { $ne: true },
    kind: { $in: ['photo', 'video'] },
  });
  if (!media?.storageKey) return fail('Memory is unavailable.', 404);

  const provider = media.provider || storage.active();
  if (provider === 's3') {
    const signed = await storage.getReadUrl({
      provider: 's3',
      storageKey: media.storageKey,
      expiresSec: 600,
      contentType: media.mime || null,
    });
    const response = NextResponse.redirect(signed, 302);
    Object.entries(NO_STORE).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }

  const bytes = await storage.read({ provider, storageKey: media.storageKey });
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': media.mime || 'application/octet-stream',
      'Content-Length': String(bytes.length),
    },
  });
}
