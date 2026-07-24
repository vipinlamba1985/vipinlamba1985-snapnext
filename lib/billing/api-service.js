import { z } from 'zod';
import { billing } from './index.js';
import { PLANS } from '../plans.js';
import { effectivePlan } from '../entitlements.js';

const checkoutSchema = z.object({
  planId: z.string().trim().min(1).max(40),
  interval: z.enum(['monthly', 'yearly']).optional().default('monthly'),
});

export class BillingApiError extends Error {
  constructor(message, status = 400, code = 'billing_request_invalid') {
    super(message);
    this.name = 'BillingApiError';
    this.status = status;
    this.code = code;
  }
}

export function parseCheckoutRequest(body = {}) {
  const parsed = checkoutSchema.safeParse(body || {});
  if (!parsed.success) {
    throw new BillingApiError('Choose a valid plan and billing interval.', 400, 'billing_checkout_invalid');
  }

  const { planId, interval } = parsed.data;
  const plan = PLANS[planId];
  if (!plan || planId === 'free' || planId === 'super_user') {
    throw new BillingApiError('Invalid plan.', 400, 'billing_plan_invalid');
  }
  return { planId, interval };
}

export async function createCheckout({ user, body }) {
  const { planId, interval } = parseCheckoutRequest(body);
  try {
    const result = await billing.createCheckoutSession({ user, planId, interval });
    return { ok: true, ...result, provider: billing.active };
  } catch (error) {
    throw new BillingApiError(
      error?.message || 'Checkout failed',
      400,
      error?.code || 'billing_checkout_failed',
    );
  }
}

export async function createPortal({ user }) {
  try {
    const result = await billing.createCustomerPortalSession({ user });
    return { ok: true, ...result, provider: billing.active };
  } catch (error) {
    throw new BillingApiError(
      error?.message || 'Portal failed',
      400,
      error?.code || 'billing_portal_failed',
    );
  }
}

export async function getStatus({ user, request }) {
  const status = await billing.getBillingStatus({ user });
  const plan = effectivePlan(user, request);
  return { ...status, plan: plan.id, planDetails: plan, isSuper: plan.id === 'super_user' };
}

export async function processStripeWebhook({ rawBody, signature }) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new BillingApiError('Webhook secret not configured', 503, 'billing_webhook_not_configured');
  }
  if (!signature) {
    throw new BillingApiError('Missing Stripe signature', 400, 'billing_webhook_signature_missing');
  }
  try {
    return await billing.handleStripeWebhook({ rawBody, signature });
  } catch (error) {
    throw new BillingApiError(
      error?.message || 'webhook_error',
      400,
      'billing_webhook_invalid',
    );
  }
}
