import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { getPlan } from '../plans.js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';

function currencyCode() {
  const value = String(process.env.STRIPE_CURRENCY || 'usd').trim().toLowerCase();
  return /^[a-z]{3}$/.test(value) ? value : 'usd';
}

export function inlineStripeLineItem(plan, interval = 'monthly') {
  const selectedInterval = interval === 'yearly' ? 'yearly' : 'monthly';
  const amount = Number(plan?.prices?.[selectedInterval]?.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('A positive paid-plan amount is required.');
  return {
    price_data: {
      currency: currencyCode(),
      unit_amount: Math.round(amount * 100),
      recurring: { interval: selectedInterval === 'yearly' ? 'year' : 'month' },
      product_data: {
        name: `SnapNext ${plan.name}`,
        description: `${plan.features?.[0] || 'SnapNext subscription'} · ${selectedInterval}`,
        metadata: { snapnextPlanId: plan.id },
      },
    },
    quantity: 1,
  };
}

async function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY missing');
  const Stripe = (await import('stripe')).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
}

export async function createInlineStripeCheckout({ user, planId, interval = 'monthly' }) {
  if (!APP_URL) throw new Error('NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_BASE_URL is required for checkout.');
  const plan = getPlan(planId);
  if (!plan || plan.id === 'free' || plan.id === 'super_user') throw new Error('Invalid plan');

  const db = await getDb();
  const existingSub = await db.collection('subscriptions').findOne({
    userId: user.id,
    provider: 'stripe',
    status: { $in: ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'] },
  });
  if (existingSub?.stripeSubscriptionId) {
    const error = new Error('You already have a subscription. Use Manage billing to change or cancel it.');
    error.code = 'subscription_exists';
    throw error;
  }

  const stripe = await stripeClient();
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: user.id, snapnextUserId: user.id },
    });
    customerId = customer.id;
    await db.collection('users').updateOne({ id: user.id }, { $set: { stripeCustomerId: customerId } });
  }

  const selectedInterval = interval === 'yearly' ? 'yearly' : 'monthly';
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [inlineStripeLineItem(plan, selectedInterval)],
    client_reference_id: user.id,
    metadata: { userId: user.id, planId: plan.id, interval: selectedInterval, pricingSource: 'inline' },
    subscription_data: { metadata: { userId: user.id, planId: plan.id, interval: selectedInterval, pricingSource: 'inline' } },
    success_url: `${APP_URL}/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/billing?cancelled=1`,
    allow_promotion_codes: true,
  });

  await db.collection('billing_events').insertOne({
    id: uuidv4(),
    provider: 'stripe',
    type: 'checkout.session.created',
    userId: user.id,
    status: 'processed',
    payload: { sessionId: session.id, planId: plan.id, interval: selectedInterval, pricingSource: 'inline' },
    error: null,
    processedAt: new Date(),
    createdAt: new Date(),
  });

  return { url: session.url, sessionId: session.id, pricingSource: 'inline' };
}
