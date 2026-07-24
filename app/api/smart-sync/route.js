import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { SmartSyncJobServiceError } from '@/lib/smart-sync/job-service';
import { getSmartSyncState, saveSmartSyncProfile } from '@/lib/smart-sync/profile-service';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const db = await getDb();
  return json(await getSmartSyncState({ db, userId: user.id }));
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const body = await request.json().catch(() => ({}));
  const db = await getDb();

  try {
    return json(await saveSmartSyncProfile({ db, userId: user.id, body }));
  } catch (error) {
    if (error instanceof SmartSyncJobServiceError) {
      return json({
        error: error.message,
        code: error.code,
        ...(error.requiresApproval ? { requiresApproval: true } : {}),
      }, error.status);
    }
    throw error;
  }
}
