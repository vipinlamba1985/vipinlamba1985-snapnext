import { billing } from './index.js';
import { effectivePlan } from '../entitlements.js';
import { BillingApiError, parseCheckoutRequest } from './request.js';

export { BillingApiError } from './request.js';

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
