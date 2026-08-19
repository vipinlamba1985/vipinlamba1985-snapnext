import crypto from 'crypto';
import { NextResponse } from 'next/server';

import { getDb } from '@/lib/db';
import { magicManifestConfig, runMagicManifestWorker } from '@/lib/magic-manifest.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cronAuthorized(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, status: 503, error: 'CRON_SECRET is not configured.' };
  const authorization = request.headers.get('authorization') || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!secureEqual(supplied, expected)) return { ok: false, status: 401, error: 'Unauthorized.' };
  return { ok: true };
}

export async function GET(request) {
  const auth = cronAuthorized(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = await getDb();
    const config = magicManifestConfig();
    const result = await runMagicManifestWorker({ db, config });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[magic-manifest-cron] failed', error);
    return NextResponse.json({ error: 'Magic manifest worker failed.' }, { status: 500 });
  }
}
