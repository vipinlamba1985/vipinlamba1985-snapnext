import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BillingApiError, parseCheckoutRequest } from '../lib/billing/request.js';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('billing checkout validation accepts billable plans and defaults monthly', () => {
  assert.deepEqual(parseCheckoutRequest({ planId: 'plus' }), { planId: 'plus', interval: 'monthly' });
  assert.deepEqual(parseCheckoutRequest({ planId: 'pro', interval: 'yearly' }), { planId: 'pro', interval: 'yearly' });
});

test('billing checkout validation rejects non-billable or unknown plans', () => {
  for (const planId of ['free', 'super_user', 'unknown']) {
    assert.throws(
      () => parseCheckoutRequest({ planId }),
      error => error instanceof BillingApiError && error.code === 'billing_plan_invalid',
    );
  }
});

test('billing checkout validation rejects unsupported intervals', () => {
  assert.throws(
    () => parseCheckoutRequest({ planId: 'pro', interval: 'weekly' }),
    error => error instanceof BillingApiError && error.code === 'billing_checkout_invalid',
  );
});

test('checkout, portal, and status routes authenticate through the server boundary', async () => {
  for (const path of [
    'app/api/billing/checkout/route.js',
    'app/api/billing/portal/route.js',
    'app/api/billing/status/route.js',
  ]) {
    const route = await source(path);
    assert.match(route, /getUserFromRequest\(request\)/);
    assert.doesNotMatch(route, /searchParams\.get\(['"]t['"]\)/);
  }
});

test('existing Stripe webhook keeps revenue-ledger verification and recording', async () => {
  const route = await source('app/api/webhooks/stripe/route.js');
  assert.match(route, /verifyStripeRevenueEvent/);
  assert.match(route, /billing\.handleStripeWebhook/);
  assert.match(route, /recordStripeRevenueEvent/);
  assert.match(route, /STRIPE_WEBHOOK_SECRET/);
});
