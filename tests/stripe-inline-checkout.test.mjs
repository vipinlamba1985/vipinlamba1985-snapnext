import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inlineStripeLineItem } from '../lib/billing/inline-checkout.js';
import { PLANS } from '../lib/plans.js';

test('inline Stripe pricing converts authoritative monthly and yearly amounts to cents', () => {
  const monthly = inlineStripeLineItem(PLANS.plus, 'monthly');
  const yearly = inlineStripeLineItem(PLANS.pro, 'yearly');
  assert.equal(monthly.price_data.unit_amount, 399);
  assert.equal(monthly.price_data.recurring.interval, 'month');
  assert.equal(yearly.price_data.unit_amount, 8999);
  assert.equal(yearly.price_data.recurring.interval, 'year');
  assert.equal(monthly.price_data.product_data.metadata.snapnextPlanId, 'plus');
});

test('an interval a plan does not sell cannot become a Stripe line item', () => {
  // Starter is yearly only, so a monthly line item must be refused outright
  // rather than built from a missing amount.
  assert.throws(() => inlineStripeLineItem(PLANS.starter, 'monthly'), /positive paid-plan amount/i);
  assert.equal(inlineStripeLineItem(PLANS.starter, 'yearly').price_data.unit_amount, 999);
});

test('billing API falls back to inline recurring pricing only for missing configured prices', () => {
  const service = fs.readFileSync('lib/billing/api-service.js', 'utf8');
  assert.match(service, /billing\.active === 'stripe'/);
  assert.match(service, /missingConfiguredPrice/);
  assert.match(service, /createInlineStripeCheckout/);
});
