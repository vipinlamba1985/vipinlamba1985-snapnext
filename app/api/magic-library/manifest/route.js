import { NextResponse } from 'next/server';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { readMagicManifestForUser } from '@/lib/magic-manifest.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function privateNoStore(data, init = {}) {
  const response = NextResponse.json(data, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Vary', 'Authorization, Cookie');
  return response;
}

async function playbackAssets(db, userId, cards = []) {
  const ids = [...new Set((Array.isArray(cards) ? cards : []).flatMap(card => Array.isArray(card?.asset_ids) ? card.asset_ids : []).map(String).filter(Boolean))];
  if (!ids.length) return [];
  return db.collection('media').find({ userId, id: { $in: ids }, trashed: { $ne: true } }).project({
    _id: 0,
    id: 1,
    kind: 1,
    mime: 1,
    name: 1,
    duration: 1,
    durationMs: 1,
  }).toArray();
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return privateNoStore({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDb();
    const delivery = await readMagicManifestForUser({ db, userId: user.id });
    const assets = await playbackAssets(db, user.id, delivery.cards);
    return privateNoStore({ ok: true, ...delivery, assets });
  } catch (error) {
    console.error('[magic-manifest-get] failed', error);
    return privateNoStore({
      error: 'Magic could not load right now.',
      code: 'magic_manifest_read_failed',
    }, { status: 500 });
  }
}
