import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import {
  SmartSyncJobServiceError,
  createOrReuseSmartSyncJob,
  listSmartSyncJobs,
} from '@/lib/smart-sync/job-service';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const db = await getDb();
  const jobs = await listSmartSyncJobs({ db, userId: user.id });
  return json({ jobs });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const body = await request.json().catch(() => ({}));
  const db = await getDb();
  const profile = await db.collection('smart_sync_profiles').findOne({ userId: user.id });

  try {
    const result = await createOrReuseSmartSyncJob({ db, userId: user.id, profile, body });
    return json(result, result.existing ? 200 : 201);
  } catch (error) {
    if (error instanceof SmartSyncJobServiceError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    throw error;
  }
}
