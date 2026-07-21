import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { SMART_SYNC_PROVIDERS } from '@/lib/smart-sync';
import { createSmartSyncJob, publicSmartSyncJob } from '@/lib/smart-sync/jobs';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }

async function providerReady(db, userId, profile) {
  const provider = SMART_SYNC_PROVIDERS.find(item => item.id === profile.providerId);
  if (!provider) return { error: 'Choose a supported Smart Sync source.' };
  if (provider.surface === 'web') {
    const connection = await db.collection('cloud_connections').findOne({ userId, provider: profile.providerId });
    if (!connection) return { error: `Connect ${provider.name} before creating a sync job.` };
    return { provider, connection };
  }
  const device = profile.nativeDevices?.find(item => item.provider === profile.providerId && item.authorized);
  if (!device) return { error: `Authorize ${provider.name} in the SnapNext mobile app first.` };
  return { provider, device };
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const db = await getDb();
  const jobs = await db.collection('smart_sync_jobs').find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).toArray();
  return json({ jobs: jobs.map(publicSmartSyncJob) });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  const profile = await db.collection('smart_sync_profiles').findOne({ userId: user.id });

  if (!profile?.providerId) return json({ error: 'Save a Smart Sync source first.' }, 400);
  if (!profile.enabled) return json({ error: 'Turn on Smart Sync before creating a job.' }, 400);
  if (!profile.approvedAt) return json({ error: 'Review and approve the Smart Sync plan first.' }, 400);

  const readiness = await providerReady(db, user.id, profile);
  if (readiness.error) return json({ error: readiness.error }, 400);

  const activeKey = `${user.id}:${profile.providerId}`;
  await db.collection('smart_sync_jobs').createIndex({ activeKey: 1 }, { unique: true, sparse: true });
  const existing = await db.collection('smart_sync_jobs').findOne({ activeKey });
  if (existing) return json({ job: publicSmartSyncJob(existing), existing: true });

  const sourceFileIds = Array.isArray(body.sourceFileIds) ? body.sourceFileIds : body.fileIds;
  const job = {
    id: uuidv4(),
    ...createSmartSyncJob({
      userId: user.id,
      providerId: profile.providerId,
      profile,
      sourceFileIds,
      mode: sourceFileIds?.length ? 'manual_selection' : String(body.mode || 'automatic'),
      estimate: { items: body.estimatedItems, bytes: body.estimatedBytes },
    }),
  };

  try {
    await db.collection('smart_sync_jobs').insertOne(job);
  } catch (error) {
    if (error?.code === 11000) {
      const active = await db.collection('smart_sync_jobs').findOne({ activeKey });
      return json({ job: publicSmartSyncJob(active), existing: true });
    }
    throw error;
  }

  return json({ job: publicSmartSyncJob(job) }, 201);
}
