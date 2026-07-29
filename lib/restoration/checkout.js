import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { getRestorationPack, restorationCurrency } from './catalog.js';
import { grantRestorationPack } from './wallet.js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';

async function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY missing');
  const Stripe = (await import('stripe')).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
}

async function ensureStripeCustomer({ stripe, db, user }) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id, snapnextUserId: user.id },
  });
  await db.collection('users').updateOne({ id: user.id }, { $set: { stripeCustomerId: customer.id } });
  return customer.id;
}

export async function createRestorationPackCheckout({ user, packId }) {
  if (!APP_URL) throw new Error('NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_BASE_URL is required for checkout.');
  const pack = getRestorationPack(packId);
  if (!pack) {
    const error = new Error('Choose a valid restoration pack.');
    error.code = 'invalid_restoration_pack';
    throw error;
  }
  if (!process.env.ENHANCE_PHOTO_PROVIDER_URL) {
    const error = new Error('Photo Restoration is still being activated, so purchases are paused.');
    error.code = 'restoration_provider_not_configured';
    throw error;
  }

  const provider = String(process.env.BILLING_PROVIDER || 'mock').toLowerCase();
  const db = await getDb();
  if (provider !== 'stripe') {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('Restoration purchases require Stripe in production.');
      error.code = 'restoration_checkout_unavailable';
      throw error;
    }
    const grantId = `mock:${user.id}:${pack.id}:${randomUUID()}`;
    const wallet = await grantRestorationPack({
      db,
      userId: user.id,
      pack,
      grantId,
      provider: 'mock',
      paymentReference: grantId,
      amount: pack.amount,
      currency: restorationCurrency(),
    });
    return { mock: true, granted: true, wallet, packId: pack.id };
  }

  const stripe = await stripeClient();
  const customerId = await ensureStripeCustomer({ stripe, db, user });
  const currency = restorationCurrency();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{
      price_data: {
        currency,
        unit_amount: Math.round(pack.amount * 100),
        product_data: {
          name: `SnapNext ${pack.name}`,
          description: `${pack.units} Restoration Credit${pack.units === 1 ? '' : 's'} · originals stay untouched`,
          metadata: { snapnextProduct: 'restoration_pack', restorationPackId: pack.id },
        },
      },
      quantity: 1,
    }],
    client_reference_id: user.id,
    metadata: {
      userId: user.id,
      purchaseType: 'restoration_pack',
      packId: pack.id,
      units: String(pack.units),
      pricingSource: 'inline',
    },
    payment_intent_data: {
      metadata: {
        userId: user.id,
        purchaseType: 'restoration_pack',
        packId: pack.id,
      },
    },
    success_url: `${APP_URL}/ai-studio/restoration?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/ai-studio/restoration?purchase=cancelled`,
    allow_promotion_codes: true,
  });

  await db.collection('billing_events').insertOne({
    id: randomUUID(),
    provider: 'stripe',
    type: 'restoration.checkout.created',
    userId: user.id,
    status: 'processed',
    payload: { sessionId: session.id, packId: pack.id, units: pack.units, amount: pack.amount, currency },
    error: null,
    processedAt: new Date(),
    createdAt: new Date(),
  });

  return { url: session.url, sessionId: session.id, packId: pack.id };
}

export async function fulfillRestorationCheckout({ db, session, eventId }) {
  if (session?.metadata?.purchaseType !== 'restoration_pack') return { handled: false };
  if (session.payment_status !== 'paid') return { handled: true, granted: false, reason: 'payment_not_paid' };
  const userId = session.metadata?.userId || session.client_reference_id;
  const pack = getRestorationPack(session.metadata?.packId);
  if (!userId || !pack) throw new Error('Restoration checkout metadata is incomplete.');

  const expectedAmount = Math.round(pack.amount * 100);
  if (Number(session.amount_total) !== expectedAmount || String(session.currency || '').toLowerCase() !== restorationCurrency()) {
    const error = new Error('Restoration checkout amount did not match the product catalog.');
    error.code = 'restoration_checkout_amount_mismatch';
    throw error;
  }

  const wallet = await grantRestorationPack({
    db,
    userId,
    pack,
    grantId: `stripe:${session.id}`,
    provider: 'stripe',
    paymentReference: session.payment_intent || session.id,
    amount: pack.amount,
    currency: restorationCurrency(),
  });

  await db.collection('restoration_purchases').updateOne(
    { grantId: `stripe:${session.id}` },
    { $set: { checkoutSessionId: session.id, paymentIntentId: session.payment_intent || null, webhookEventId: eventId || null, updatedAt: new Date() } },
  );
  return { handled: true, granted: true, wallet, packId: pack.id };
}
