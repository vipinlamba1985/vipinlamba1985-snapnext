import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { peopleCapabilitySummary } from '@/lib/people-rekognition-capabilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    ...peopleCapabilitySummary(),
    checks: [],
    videoMode: 'disabled',
    costMode: 'minimum_required_calls_only',
  });
}
