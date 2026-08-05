import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { effectivePlan } from '@/lib/entitlements';
import { getProtectedBytes } from '@/lib/protection-usage';
import { preflightProtectionItem } from '@/lib/protection-preflight';
import { releaseReservations } from '@/lib/protection-reservations';

export const runtime = 'nodejs';

function acceptedReservationIds(decisions = []) {
  return [...new Set(decisions
    .filter((decision) => decision?.decision === 'ACCEPT' && decision.reservationId)
    .map((decision) => decision.reservationId))];
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
  if (!items.length) return NextResponse.json({ error: 'No items to check' }, { status: 400 });

  const db = await getDb();
  const plan = effectivePlan(user, request);
  const usedBytes = await getProtectedBytes(db, user.id);
  const decisions = [];
  try {
    for (const item of items) {
      decisions.push(await preflightProtectionItem({ db, user, plan, usedBytes, item }));
    }
  } catch (error) {
    const reservationIds = acceptedReservationIds(decisions);
    if (reservationIds.length) {
      await releaseReservations(db, {
        reservationIds,
        userId: user.id,
        status: 'preflight_failed',
      }).catch(() => null);
    }
    console.error('[protection] preflight batch failed', error?.message);
    return NextResponse.json({
      error: 'Could not check this upload batch. No prepared space was kept.',
      code: 'protection_preflight_failed',
    }, { status: 500 });
  }

  return NextResponse.json({ decisions, planId: plan.id, storageLimitBytes: plan.storageBytes, usedBytes });
}
