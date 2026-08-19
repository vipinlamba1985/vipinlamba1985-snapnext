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

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return privateNoStore({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDb();
    const delivery = await readMagicManifestForUser({ db, userId: user.id });
    return privateNoStore({ ok: true, ...delivery });
  } catch (error) {
    console.error('[magic-manifest-get] failed', error);
    return privateNoStore({
      error: 'Magic could not load right now.',
      code: 'magic_manifest_read_failed',
    }, { status: 500 });
  }
}
