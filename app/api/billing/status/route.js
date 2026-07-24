import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getStatus } from '@/lib/billing/api-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getStatus({ user, request }));
}
