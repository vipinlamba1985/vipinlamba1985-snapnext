import { z } from 'zod';
import { PLANS, planSupportsInterval } from '../plans.js';

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
  // Some plans are yearly only, so the interval is checked here rather than
  // trusted from the client — otherwise a hand-made request could open a
  // checkout on an interval that is not offered.
  if (!planSupportsInterval(planId, interval)) {
    throw new BillingApiError(
      `${plan.name} is billed yearly.`,
      400,
      'billing_interval_unavailable',
    );
  }
  return { planId, interval };
}
