import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { peopleCapabilitySummary } from '@/lib/people-rekognition-capabilities';
import { peopleCollectionId } from '@/lib/people-intelligence';
import { probePeopleCapabilities } from '@/lib/people-rekognition-capabilities.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const collectionId = peopleCollectionId(user.id);
  const summary = peopleCapabilitySummary();
  const checks = await probePeopleCapabilities({ collectionId });

  return NextResponse.json({
    ...summary,
    collectionId,
    checks,
    videoMode: summary.policy.videoEnabled ? 'enabled_on_demand' : 'disabled_until_business_gate',
  });
}
