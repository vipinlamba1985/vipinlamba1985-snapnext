import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import {
  countPendingGroupPhotoCleanup,
  reconcileGroupPhotoClusters,
} from '@/lib/people-group-photo-reconciliation.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Repairs People identities polluted by large group photos indexed before the
 * index-time exclusion existed. Pure database work — no Rekognition call, so
 * there is no AWS cost and no engine-permission failure mode.
 */
export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  const remaining = await countPendingGroupPhotoCleanup({ db, userId: user.id });
  return NextResponse.json({ remaining, cleanupRequired: remaining > 0 });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const limit = Number(body.limit || 50);
  const db = await getDb();

  try {
    const result = await reconcileGroupPhotoClusters({ db, userId: user.id, limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[people-group-photo-reconcile] failed', error?.name, error?.message);
    return NextResponse.json(
      { error: 'Could not finish tidying group photos. Your photos are unchanged.', code: 'group_photo_reconcile_failed' },
      { status: 503 },
    );
  }
}
