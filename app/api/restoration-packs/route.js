import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { publicRestorationCatalog, restorationCurrency } from '@/lib/restoration/catalog';
import { createRestorationPackCheckout } from '@/lib/restoration/checkout';
import { isRestorationProviderReady } from '@/lib/restoration/provider';
import { getRestorationWallet } from '@/lib/restoration/wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const db = await getDb();
  const stripeReady = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  const billingProvider = String(process.env.BILLING_PROVIDER || 'mock').toLowerCase();
  const providerReady = isRestorationProviderReady();
  return json({
    ...publicRestorationCatalog(),
    wallet: await getRestorationWallet(db, user.id),
    providerReady,
    checkoutReady: providerReady
      && restorationCurrency() === 'usd'
      && (billingProvider === 'stripe' ? stripeReady : process.env.NODE_ENV !== 'production'),
  });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  try {
    return json(await createRestorationPackCheckout({ user, packId: body.packId }));
  } catch (error) {
    return json({
      error: error?.message || 'Restoration checkout could not be started.',
      code: error?.code || 'restoration_checkout_failed',
    }, error?.code === 'invalid_restoration_pack' ? 400 : 503);
  }
}
