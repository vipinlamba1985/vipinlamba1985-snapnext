import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { entitlementForUser } from '@/lib/entitlements';
import { magicPeopleLimitForPlan, normalizeMagicPeople } from '@/lib/magic-library';

export const runtime = 'nodejs';

async function state(request) {
  const user = await getUserFromRequest(request);
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const db = await getDb();
  const planId = entitlementForUser(user, request).planId || 'free';
  const limit = magicPeopleLimitForPlan(planId);
  const row = await db.collection('magic_library_activation').findOne({ userId: user.id });
  const clusters = await db.collection('person_clusters').find({ userId: user.id, status: { $ne: 'hidden' } }, { projection: { clusterId: 1 } }).toArray();
  const validIds = new Set(clusters.map((cluster) => cluster.clusterId));
  const stored = normalizeMagicPeople(row?.active || []);
  const active = stored.filter((clusterId) => validIds.has(clusterId));
  return { user, db, planId, limit, active, validIds };
}

export async function GET(request) {
  const s = await state(request);
  if (s.error) return s.error;
  return NextResponse.json({ planId: s.planId, limit: s.limit, active: s.active, enabled: s.active.slice(0, s.limit) });
}

export async function POST(request) {
  const s = await state(request);
  if (s.error) return s.error;
  const body = await request.json().catch(() => ({}));
  const requested = normalizeMagicPeople(body.people || []).filter((clusterId) => s.validIds.has(clusterId));
  if (s.active.some((clusterId) => !requested.includes(clusterId))) {
    return NextResponse.json({ error: 'Activated selections cannot be replaced.' }, { status: 409 });
  }
  const merged = normalizeMagicPeople([...s.active, ...requested]);
  if (merged.length > s.limit) return NextResponse.json({ error: `Your plan supports ${s.limit} active people.` }, { status: 403 });
  await s.db.collection('magic_library_activation').updateOne(
    { userId: s.user.id },
    { $set: { active: merged, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  return NextResponse.json({ ok: true, planId: s.planId, limit: s.limit, active: merged, enabled: merged.slice(0, s.limit) });
}
