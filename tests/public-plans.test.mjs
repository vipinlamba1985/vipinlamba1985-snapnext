import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicPlans } from '../lib/public-plans.js';

test('public plan catalogue mirrors the authoritative launch plans', () => {
  const plans = publicPlans();
  assert.deepEqual(plans.map((plan) => plan.id), ['free', 'starter', 'plus', 'pro', 'family']);
  assert.deepEqual(plans.map((plan) => plan.price), [0, 0.99, 3.99, 8.99, 14.99]);
  assert.deepEqual(plans.map((plan) => plan.storageGb), [15, 20, 75, 200, 400]);
  assert.equal(plans.some((plan) => plan.id === 'super_user'), false);
  assert.equal(plans.find((plan) => plan.id === 'starter').prices.yearly.amount, 9.99);
  assert.equal(plans.find((plan) => plan.id === 'starter').prices.monthly.stripePriceId, 'inline');
  assert.equal(plans.find((plan) => plan.id === 'starter').prices.monthly.checkoutMode, 'inline_price');
});

test('plans API has no second hardcoded catalogue', () => {
  const route = fs.readFileSync('app/api/plans/route.js', 'utf8');
  assert.match(route, /publicPlans\(\)/);
  assert.doesNotMatch(route, /storageGb:\s*1000/);
  assert.doesNotMatch(route, /price:\s*4\.99/);
});
