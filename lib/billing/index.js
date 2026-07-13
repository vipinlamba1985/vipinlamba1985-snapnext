// SnapNext AI billing abstraction.
//
// Providers:
//   - mock   : flips user plan instantly (dev only — refused in production)
//   - stripe : creates real Checkout Sessions, Customer Portal, processes webhooks
//
// Active provider is chosen by BILLING_PROVIDER env var.
// Plans live in lib/plans.js (single source of truth).

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/db';
import { PLANS, getPlan, planFromStripePrice, hasAnyStripePrices } from '@/lib/plans';

const ACTIVE = (process.env.BILLING_PROVIDER || 'mock').toLowerCase();
const IS_PROD = process.env.NODE_ENV === 'production';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
const PAYMENT_GRACE_DAYS = Math.max(1, Number(process.env.BILLING_PAYMENT_GRACE_DAYS || 7));

let _stripe = null;
function stripeMissingKeys() {
  const m = [];
  if (!process.env.STRIPE_SECRET_KEY) m.push('STRIPE_SECRET_KEY');
  if (!process.env.STRIPE_WEBHOOK_SECRET) m.push('STRIPE_WEBHOOK_SECRET');
  return m;
}
async function getStripe() {
  if (_stripe) return _stripe;
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY missing');
  const Stripe = (await import('stripe')).default;
  _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
  return _stripe;
}

const mockProvider = {
  name: 'mock',
  async createCheckoutSession({ user, planId, interval = 'monthly' }) {
    if (IS_PROD && ACTIVE === 'mock') throw new Error('Mock billing cannot run in production. Set BILLING_PROVIDER=stripe.');
    const plan = getPlan(planId);
    if (!plan || plan.id === 'free' || plan.id === 'super_user') throw new Error('Invalid plan');
    const db = await getDb();
    await db.collection('users').updateOne({ id: user.id }, { $set: { plan: plan.id } });
    await db.collection('subscriptions').updateOne(
      { userId: user.id },
      { $set: { userId: user.id, provider: 'mock', status: 'active', plan: plan.id, billingInterval: interval, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), cancelAtPeriodEnd: false, updatedAt: new Date() }, $setOnInsert: { id: uuidv4(), createdAt: new Date() } },
      { upsert: true },
    );
    await logBillingEvent({ provider: 'mock', type: 'mock.upgrade', userId: user.id, payload: { planId, interval } });
    return { mock: true, planId: plan.id, url: `${APP_URL}/billing?success=1&mock=1` };
  },
  async createCustomerPortalSession() {
    if (IS_PROD && ACTIVE === 'mock') throw new Error('Mock billing cannot run in production. Set BILLING_PROVIDER=stripe.');
    return { mock: true, url: `${APP_URL}/billing?portal=mock` };
  },
  async getBillingStatus({ user }) {
    const db = await getDb();
    const sub = await db.collection('subscriptions').findOne({ userId: user.id });
    return { provider: 'mock', subscription: sub ? clean(sub) : null };
  },
};

const stripeProvider = {
  name: 'stripe',
  async createCheckoutSession({ user, planId, interval = 'monthly' }) {
    const plan = getPlan(planId);
    if (!plan || plan.id === 'free' || plan.id === 'super_user') throw new Error('Invalid plan');
    const priceId = plan.prices?.[interval]?.stripePriceId;
    if (!priceId) throw new Error(`Stripe price ID not configured for ${plan.name} (${interval}). Set STRIPE_PRICE_${plan.id.toUpperCase()}_${interval.toUpperCase()}.`);
    const stripe = await getStripe();
    const db = await getDb();
    const existingSub = await db.collection('subscriptions').findOne({ userId: user.id, provider: 'stripe', status: { $in: ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'] } });
    if (existingSub?.stripeSubscriptionId) {
      const err = new Error('You already have a subscription. Use Manage billing to change or cancel it.');
      err.code = 'subscription_exists';
      throw err;
    }
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: user.id, snapnextUserId: user.id } });
      customerId = customer.id;
      await db.collection('users').updateOne({ id: user.id }, { $set: { stripeCustomerId: customerId } });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: customerId, line_items: [{ price: priceId, quantity: 1 }], client_reference_id: user.id,
      metadata: { userId: user.id, planId: plan.id, interval }, subscription_data: { metadata: { userId: user.id, planId: plan.id, interval } },
      success_url: `${APP_URL}/billing?success=1&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${APP_URL}/billing?cancelled=1`, allow_promotion_codes: true,
    });
    await logBillingEvent({ provider: 'stripe', type: 'checkout.session.created', userId: user.id, payload: { sessionId: session.id, planId, interval } });
    return { url: session.url, sessionId: session.id };
  },
  async createCustomerPortalSession({ user }) {
    if (!user.stripeCustomerId) {
      const err = new Error('No active subscription found. Subscribe first to manage billing.');
      err.code = 'no_customer';
      throw err;
    }
    const stripe = await getStripe();
    const session = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${APP_URL}/billing` });
    return { url: session.url };
  },
  async getBillingStatus({ user }) {
    const db = await getDb();
    const sub = await db.collection('subscriptions').findOne({ userId: user.id });
    return { provider: 'stripe', subscription: sub ? clean(sub) : null };
  },
  async handleWebhook({ event }) {
    const db = await getDb();
    const existing = await db.collection('billing_events').findOne({ eventId: event.id });
    if (existing && existing.status === 'processed') return { duplicate: true };
    const eventDoc = { id: existing?.id || uuidv4(), provider: 'stripe', eventId: event.id, type: event.type, processedAt: null, status: 'received', payload: summarize(event), createdAt: new Date() };
    if (!existing) await db.collection('billing_events').insertOne(eventDoc);
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const s = event.data.object;
          const userId = s.metadata?.userId || s.client_reference_id;
          if (userId && s.customer) await db.collection('users').updateOne({ id: userId }, { $set: { stripeCustomerId: s.customer } });
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await applySubscription(db, event.data.object);
          break;
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const userId = await resolveUserIdFromSub(db, sub);
          if (userId) await downgradeUser(db, userId, { reason: 'subscription_deleted', subscriptionId: sub.id });
          break;
        }
        case 'invoice.payment_failed': {
          const inv = event.data.object;
          const userId = await resolveUserIdFromCustomer(db, inv.customer);
          if (userId) {
            const graceEndsAt = new Date(Date.now() + PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000);
            await db.collection('subscriptions').updateOne({ userId }, { $set: { status: 'past_due', latestInvoiceId: inv.id, graceEndsAt, paymentFailedAt: new Date(), updatedAt: new Date() } }, { upsert: true });
          }
          break;
        }
        case 'invoice.payment_succeeded': {
          const inv = event.data.object;
          const userId = await resolveUserIdFromCustomer(db, inv.customer);
          if (userId) {
            const sub = await db.collection('subscriptions').findOne({ userId });
            await db.collection('subscriptions').updateOne({ userId }, { $set: { latestInvoiceId: inv.id, status: 'active', graceEndsAt: null, paymentRecoveredAt: new Date(), updatedAt: new Date() } }, { upsert: true });
            if (sub?.plan && sub.plan !== 'free') await db.collection('users').updateOne({ id: userId }, { $set: { plan: sub.plan } });
          }
          break;
        }
        case 'charge.refunded': {
          const charge = event.data.object;
          const userId = await resolveUserIdFromCustomer(db, charge.customer);
          if (userId) await db.collection('subscriptions').updateOne({ userId }, { $set: { lastRefundedChargeId: charge.id, refundedAt: new Date(), updatedAt: new Date() } }, { upsert: true });
          break;
        }
        case 'charge.dispute.created': {
          const charge = event.data.object;
          const userId = await resolveUserIdFromCustomer(db, charge.customer);
          if (userId) await db.collection('subscriptions').updateOne({ userId }, { $set: { status: 'disputed', disputeId: charge.id, disputedAt: new Date(), updatedAt: new Date() } }, { upsert: true });
          break;
        }
        case 'charge.dispute.closed': {
          const dispute = event.data.object;
          const charge = dispute.charge ? await (await getStripe()).charges.retrieve(dispute.charge) : null;
          const userId = await resolveUserIdFromCustomer(db, charge?.customer);
          if (userId) {
            const won = dispute.status === 'won';
            await db.collection('subscriptions').updateOne({ userId }, { $set: { status: won ? 'active' : 'dispute_lost', disputeStatus: dispute.status, disputeClosedAt: new Date(), updatedAt: new Date() } }, { upsert: true });
            if (!won) await downgradeUser(db, userId, { reason: 'dispute_lost', disputeId: dispute.id });
          }
          break;
        }
        default: break;
      }
      await db.collection('billing_events').updateOne({ eventId: event.id }, { $set: { status: 'processed', processedAt: new Date() } });
      return { ok: true };
    } catch (e) {
      await db.collection('billing_events').updateOne({ eventId: event.id }, { $set: { status: 'error', error: e?.message || String(e), processedAt: new Date() } });
      throw e;
    }
  },
  async verifyWebhook({ rawBody, signature }) {
    const stripe = await getStripe();
    return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  },
};

async function applySubscription(db, sub) {
  const userId = sub.metadata?.userId || await resolveUserIdFromCustomer(db, sub.customer);
  if (!userId) { console.warn('[billing] subscription event without userId, customer=', sub.customer); return; }
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id;
  const planFromPrice = planFromStripePrice(priceId);
  const planId = planFromPrice?.planId || sub.metadata?.planId || 'free';
  const interval = planFromPrice?.interval || sub.metadata?.interval || (item?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly');
  const existing = await db.collection('subscriptions').findOne({ userId });
  const now = new Date();
  const graceEndsAt = sub.status === 'past_due' ? (existing?.graceEndsAt || new Date(Date.now() + PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000)) : null;
  const update = {
    userId, provider: 'stripe', stripeCustomerId: sub.customer, stripeSubscriptionId: sub.id, status: sub.status, plan: planId,
    billingInterval: interval, priceId, currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null, cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null, canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    latestInvoiceId: sub.latest_invoice || null, graceEndsAt, updatedAt: now,
  };
  await db.collection('subscriptions').updateOne({ userId }, { $set: update, $setOnInsert: { id: uuidv4(), createdAt: now } }, { upsert: true });
  const healthy = ['active', 'trialing'].includes(sub.status);
  const withinGrace = sub.status === 'past_due' && graceEndsAt && graceEndsAt > now;
  await db.collection('users').updateOne({ id: userId }, { $set: { plan: (healthy || withinGrace) ? planId : 'free', stripeCustomerId: sub.customer } });
}

async function downgradeUser(db, userId, meta = {}) {
  const now = new Date();
  await db.collection('users').updateOne({ id: userId }, { $set: { plan: 'free' } });
  await db.collection('subscriptions').updateOne({ userId }, { $set: { status: 'canceled', plan: 'free', graceEndsAt: null, updatedAt: now, canceledAt: now, ...meta } }, { upsert: true });
}

async function resolveUserIdFromSub(db, sub) {
  if (sub.metadata?.userId) return sub.metadata.userId;
  const u = await db.collection('users').findOne({ stripeCustomerId: sub.customer });
  return u?.id || null;
}
async function resolveUserIdFromCustomer(db, customerId) {
  if (!customerId) return null;
  const u = await db.collection('users').findOne({ stripeCustomerId: customerId });
  return u?.id || null;
}
async function logBillingEvent({ provider, type, userId = null, status = 'processed', payload = {}, error = null }) {
  try {
    const db = await getDb();
    await db.collection('billing_events').insertOne({ id: uuidv4(), provider, type, userId, status, payload, error, processedAt: new Date(), createdAt: new Date() });
  } catch (e) { console.error('[billing] log failed', e?.message); }
}
function clean(doc) { if (!doc) return doc; const { _id, ...rest } = doc; return rest; }
function summarize(event) {
  const o = event.data?.object || {};
  return { id: o.id, object: o.object, customer: o.customer, status: o.status, plan: o.metadata?.planId, amount_total: o.amount_total };
}
function activeProvider() { return ACTIVE === 'stripe' ? stripeProvider : mockProvider; }

export const billing = {
  active: ACTIVE,
  isMock: () => ACTIVE === 'mock',
  isStripe: () => ACTIVE === 'stripe',
  async createCheckoutSession(args) { return activeProvider().createCheckoutSession(args); },
  async createCustomerPortalSession(args) { return activeProvider().createCustomerPortalSession(args); },
  async getBillingStatus(args) { return activeProvider().getBillingStatus(args); },
  async handleStripeWebhook({ rawBody, signature }) {
    const event = await stripeProvider.verifyWebhook({ rawBody, signature });
    return stripeProvider.handleWebhook({ event });
  },
  async health() {
    const missing = stripeMissingKeys();
    const ready = ACTIVE === 'mock' || missing.length === 0;
    const stripeKeyMasked = process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.slice(0, 7) + '...' + process.env.STRIPE_SECRET_KEY.slice(-4) : null;
    const priceIds = {
      plus_monthly: !!process.env.STRIPE_PRICE_PLUS_MONTHLY,
      plus_yearly: !!process.env.STRIPE_PRICE_PLUS_YEARLY,
      pro_monthly: !!process.env.STRIPE_PRICE_PRO_MONTHLY,
      pro_yearly: !!process.env.STRIPE_PRICE_PRO_YEARLY,
      family_monthly: !!process.env.STRIPE_PRICE_FAMILY_MONTHLY,
      family_yearly: !!process.env.STRIPE_PRICE_FAMILY_YEARLY,
    };
    return { active: ACTIVE, ready, stripeKey: stripeKeyMasked, webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET, publishableKey: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, priceIds, hasAnyPrices: hasAnyStripePrices(), missing, paymentGraceDays: PAYMENT_GRACE_DAYS, production: IS_PROD };
  },
};
