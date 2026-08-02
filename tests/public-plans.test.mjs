import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicPlans } from '../lib/public-plans.js';

test('public plan catalogue mirrors the authoritative launch plans', () => {
  const plans = publicPlans();
  assert.deepEqual(plans.map((plan) => plan.id), ['free', 'starter', 'plus', 'pro', 'family']);
  // Starter carries no monthly price, so its headline monthly figure is 0.
  assert.deepEqual(plans.map((plan) => plan.price), [0, 0, 3.99, 8.99, 14.99]);
  assert.deepEqual(plans.map((plan) => plan.storageGb), [15, 20, 75, 200, 400]);
  assert.equal(plans.some((plan) => plan.id === 'super_user'), false);

  const starter = plans.find((plan) => plan.id === 'starter');
  assert.equal(starter.yearlyOnly, true);
  assert.equal(starter.prices.yearly.amount, 9.99);
  assert.equal(starter.prices.yearly.checkoutMode, 'inline_price');
  // Nothing may present a buyable monthly Starter.
  assert.equal(starter.prices.monthly.stripePriceId, null);
  assert.equal(starter.prices.monthly.checkoutMode, 'free');
});

test('plans API has no second hardcoded catalogue', () => {
  const route = fs.readFileSync('app/api/plans/route.js', 'utf8');
  assert.match(route, /publicPlans\(\)/);
  assert.doesNotMatch(route, /storageGb:\s*1000/);
  assert.doesNotMatch(route, /price:\s*4\.99/);
});
