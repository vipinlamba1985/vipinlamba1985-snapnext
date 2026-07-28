import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import {
  normalizeSmartSyncProviderRequest,
  upsertProviderRequest,
} from '@/lib/smart-sync/provider-request';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const profile = await (await getDb()).collection('smart_sync_profiles').findOne(
    { userId: user.id },
    { projection: { providerRequests: 1, _id: 0 } },
  );
  return json({ requests: Array.isArray(profile?.providerRequests) ? profile.providerRequests : [] });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  try {
    const normalized = normalizeSmartSyncProviderRequest(await request.json().catch(() => ({})));
    const db = await getDb();
    const profile = await db.collection('smart_sync_profiles').findOne(
      { userId: user.id },
      { projection: { providerRequests: 1 } },
    );
    const now = new Date();
    const providerRequests = upsertProviderRequest(profile?.providerRequests, normalized, now);

    await db.collection('smart_sync_profiles').updateOne(
      { userId: user.id },
      {
        $set: { providerRequests, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    return json({ ok: true, request: providerRequests.find(item => item.providerKey === normalized.providerKey) });
  } catch (error) {
    if (error?.code === 'provider_required') return json({ error: error.message, code: error.code }, 400);
    throw error;
  }
}
