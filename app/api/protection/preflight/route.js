import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { effectivePlan } from '@/lib/entitlements';
import { getProtectedBytes } from '@/lib/protection-usage';
import { preflightProtectionItem } from '@/lib/protection-preflight';

export const runtime = 'nodejs';

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
  for (const item of items) {
    decisions.push(await preflightProtectionItem({ db, user, plan, usedBytes, item }));
  }

  return NextResponse.json({ decisions, planId: plan.id, storageLimitBytes: plan.storageBytes, usedBytes });
}
