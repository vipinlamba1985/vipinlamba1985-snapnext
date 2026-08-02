// Starter is yearly only. At $0.99 a month, card processing (a fixed ~$0.30
// plus 2.9%) takes about a third of the payment before storage or AI is paid
// for, so the monthly option lost money on anyone who used it. Billed yearly,
// one fee is charged instead of twelve.
import test from 'node:test';
import assert from 'node:assert/strict';

import { PLANS, monthlyEquivalent, planSupportsInterval, yearlySavings } from '../lib/plans.js';
import { publicPlans } from '../lib/public-plans.js';
import { BillingApiError, parseCheckoutRequest } from '../lib/billing/request.js';

test('Starter is sold yearly only', () => {
  assert.equal(PLANS.starter.yearlyOnly, true);
  assert.equal(PLANS.starter.prices.monthly.amount, null);
  assert.equal(PLANS.starter.prices.monthly.stripePriceId, null);
  assert.equal(PLANS.starter.prices.yearly.amount, 11.88);
});

test('a monthly Starter checkout is refused by the server', () => {
  assert.throws(
    () => parseCheckoutRequest({ planId: 'starter', interval: 'monthly' }),
    (error) => error instanceof BillingApiError && error.code === 'billing_interval_unavailable',
    'the client must not be able to open a checkout on an interval that is not offered',
  );

  // The interval defaults to monthly, so a request that omits it must also fail
  // rather than quietly falling back to a price that does not exist.
  assert.throws(() => parseCheckoutRequest({ planId: 'starter' }), BillingApiError);

  // Yearly still works.
  assert.deepEqual(parseCheckoutRequest({ planId: 'starter', interval: 'yearly' }), {
    planId: 'starter',
    interval: 'yearly',
  });
});

test('the other paid plans keep both intervals', () => {
  for (const id of ['plus', 'pro', 'family']) {
    assert.equal(planSupportsInterval(id, 'monthly'), true, `${id} should still be sold monthly`);
    assert.equal(planSupportsInterval(id, 'yearly'), true, `${id} should still be sold yearly`);
  }
  assert.equal(planSupportsInterval('free', 'monthly'), false);
  assert.equal(planSupportsInterval('super_user', 'yearly'), false);
});

test('a yearly price is shown as what it costs per month', () => {
  // The yearly amount is twelve months at the price point, so the per-month
  // figure is exactly $0.99 rather than an odd number from a rounded total.
  assert.equal(monthlyEquivalent('starter'), 0.99);
  assert.ok(monthlyEquivalent('plus') < PLANS.plus.prices.monthly.amount);
});

test('annual savings are real numbers, not a slogan', () => {
  const plus = yearlySavings('plus');
  // 3.99 x 12 = 47.88 against 39.99.
  assert.equal(plus.amount, 7.89);
  assert.equal(plus.percent, 16);
  assert.ok(plus.monthsFree >= 1.9 && plus.monthsFree <= 2.1, 'roughly two months free');

  // Starter has no monthly price to compare against, so it must not invent one.
  assert.equal(yearlySavings('starter'), null);
  assert.equal(yearlySavings('free'), null);
});

test('the public plan list tells the UI which plans are yearly only', () => {
  const plans = new Map(publicPlans().map((plan) => [plan.id, plan]));

  assert.equal(plans.get('starter').yearlyOnly, true);
  assert.equal(plans.get('plus').yearlyOnly, false);

  // A monthly Starter must not look purchasable.
  assert.equal(plans.get('starter').prices.monthly.amount, 0);
  assert.equal(plans.get('starter').prices.monthly.stripePriceId, null);
  assert.ok(plans.get('starter').prices.yearly.amount > 0);

  assert.equal(plans.get('plus').savings.amount, 7.89);
});
