export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { billing } from '@/lib/billing';
import { getDb } from '@/lib/db';
import { recordStripeRevenueEvent, verifyStripeRevenueEvent } from '@/lib/stripe-revenue-ledger';

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') || '';

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: 'Webhook secret not configured' }, { status: 503 });
  }

  try {
    const event = await verifyStripeRevenueEvent({ rawBody, signature });
    const billingResult = await billing.handleStripeWebhook({ rawBody, signature });
    const db = await getDb();
    const revenueLedger = await recordStripeRevenueEvent({ db, event });
    return Response.json({ received: true, billing: billingResult, revenueLedger });
  } catch (error) {
    console.error('[stripe-webhook]', error?.message);
    return Response.json({ error: 'Webhook processing failed' }, { status: 400 });
  }
}
