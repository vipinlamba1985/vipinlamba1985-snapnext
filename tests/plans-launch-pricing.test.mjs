import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLANS, getPlan } from '../lib/plans.js';

test('launch pricing follows the approved entry-to-family ladder', () => {
  // Starter is yearly only: a $0.99 monthly charge loses about a third to the
  // fixed card processing fee before storage or AI is paid for.
  assert.equal(PLANS.starter.prices.monthly.amount, null);
  assert.equal(PLANS.starter.prices.yearly.amount, 9.99);

  assert.equal(PLANS.plus.prices.monthly.amount, 3.99);
  assert.equal(PLANS.pro.prices.monthly.amount, 8.99);
  assert.equal(PLANS.family.prices.monthly.amount, 14.99);
});

test('paid storage caps increase by tier without the previous 1 TB and 2 TB loss exposure', () => {
  const paid = [PLANS.starter, PLANS.plus, PLANS.pro, PLANS.family];
  assert.deepEqual(paid.map(plan => plan.storageBytes / 1024 ** 3), [20, 75, 200, 400]);
  for (let index = 1; index < paid.length; index += 1) assert.ok(paid[index].storageBytes > paid[index - 1].storageBytes);
  assert.equal(getPlan('starter').id, 'starter');
});

test('operations metrics derive paid users from the billable plan configuration', () => {
  const source = fs.readFileSync('app/api/admin/operations/route.js', 'utf8');
  assert.match(source, /Object\.values\(PLANS\)/);
  assert.match(source, /BILLABLE_PLAN_IDS/);
  assert.doesNotMatch(source, /\['plus', 'pro', 'family', 'super_user'\]/);
});
