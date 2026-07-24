import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { BillingApiError, createCheckout } from '@/lib/billing/api-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await createCheckout({ user, body }));
  } catch (error) {
    if (error instanceof BillingApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code, provider: process.env.BILLING_PROVIDER || 'mock' },
        { status: error.status },
      );
    }
    throw error;
  }
}
