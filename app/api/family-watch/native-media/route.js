import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { storage } from '@/lib/storage';
import { familyWatchSecretMatches } from '@/lib/family-watch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,80}$/;
const COMMON_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Content-Type-Options': 'nosniff',
};

function json(payload, status) {
  return NextResponse.json(payload, { status, headers: COMMON_HEADERS });
}

function safeSessionId(value) {
  return ID_PATTERN.test(String(value || '')) ? String(value) : null;
}

function safeToken(value) {
  return TOKEN_PATTERN.test(String(value || '')) ? String(value) : null;
}

function safeSlot(value) {
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 0 && slot < 40 ? slot : null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: COMMON_HEADERS });
}

export async function HEAD(request) {
  return handle(request, true);
}

export async function GET(request) {
  return handle(request, false);
}

async function handle(request, headOnly) {
  const url = new URL(request.url);
  const sessionId = safeSessionId(url.searchParams.get('session'));
  const slot = safeSlot(url.searchParams.get('slot'));
  const token = safeToken(url.searchParams.get('token'));
  if (!sessionId || slot === null || !token) {
    return json({ error: 'Temporary family media link is invalid.' }, 400);
  }

  const db = await getDb();
  const now = new Date();
  const session = await db.collection('family_watch_sessions').findOne({
    id: sessionId,
    status: 'approved',
    transport: { $in: ['google-cast', 'airplay'] },
    expiresAt: { $gt: now },
  });
  if (!session) return json({ error: 'Family media link expired.' }, 410);

  const expectedHash = session.nativeAccessHashes?.[slot];
  const mediaId = session.mediaIds?.[slot];
  if (!expectedHash || !mediaId || !familyWatchSecretMatches(token, expectedHash)) {
    return json({ error: 'Family media link is not authorized.' }, 403);
  }

  const media = await db.collection('media').findOne({
    userId: session.userId,
    id: mediaId,
    trashed: { $ne: true },
    kind: { $in: ['photo', 'video'] },
  });
  if (!media?.storageKey) return json({ error: 'Family memory is unavailable.' }, 404);

  const provider = media.provider || storage.active();
  const contentType = String(media.mime || media.contentType || (media.kind === 'video' ? 'video/mp4' : 'image/jpeg'));
  const remainingSeconds = Math.max(30, Math.min(900, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)));

  if (provider === 's3') {
    try {
      const signed = await storage.getReadUrl({
        provider: 's3',
        storageKey: media.storageKey,
        expiresSec: remainingSeconds,
        contentType,
      });
      const response = NextResponse.redirect(signed, 302);
      for (const [key, value] of Object.entries(COMMON_HEADERS)) response.headers.set(key, value);
      return response;
    } catch (error) {
      console.error('[family-watch/native-media] signed read failed', error?.message);
      return json({ error: 'Family memory is temporarily unavailable.' }, 502);
    }
  }

  try {
    const buffer = headOnly ? null : await storage.read({ provider, storageKey: media.storageKey });
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        ...COMMON_HEADERS,
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        ...(Number.isFinite(Number(media.size)) ? { 'Content-Length': String(Number(media.size)) } : {}),
      },
    });
  } catch (error) {
    console.error('[family-watch/native-media] local read failed', error?.message);
    return json({ error: 'Family memory is temporarily unavailable.' }, 502);
  }
}
