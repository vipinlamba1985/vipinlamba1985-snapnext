import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { TripSharingError, approveTripShare, listTripShareSuggestions } from '@/lib/trip-sharing-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function fail(error) {
  if (error instanceof TripSharingError) return json({ error: error.message, code: error.code }, error.status);
  console.error('[trip-sharing]', error?.message || error);
  return json({ error: 'Trip sharing is unavailable right now.', code: 'trip_sharing_error' }, 500);
}

// GET only drafts suggestions. Nothing is shared until POST, which the owner
// triggers by approving a specific set of photos for a specific person.
export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    return json(await listTripShareSuggestions(user));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized', code: 'auth_unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    return json(await approveTripShare(user, body));
  } catch (error) {
    return fail(error);
  }
}
