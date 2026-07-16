import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { listProviderStatus } from '@/lib/smart-sync/providers';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  return NextResponse.json({ providers: listProviderStatus() });
}
