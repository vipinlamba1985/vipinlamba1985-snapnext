import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExistingUserIdFromCustomer,
  resolveExistingUserIdFromSubscription,
} from '../lib/billing/user-resolution.js';

function fakeDb(users = []) {
  return {
    collection(name) {
      assert.equal(name, 'users');
      return {
        async findOne(filter) {
          return users.find((user) => Object.entries(filter).every(([key, value]) => user[key] === value)) || null;
        },
      };
    },
  };
}

test('subscription metadata user id is accepted only when the user still exists', async () => {
  const db = fakeDb([{ id: 'user-1', stripeCustomerId: 'cus_1' }]);
  assert.equal(
    await resolveExistingUserIdFromSubscription(db, { metadata: { userId: 'user-1' }, customer: 'cus_1' }),
    'user-1',
  );
  assert.equal(
    await resolveExistingUserIdFromSubscription(db, { metadata: { userId: 'deleted-user' }, customer: 'cus_old' }),
    null,
  );
});

test('subscription customer fallback resolves only an existing SnapNext user', async () => {
  const db = fakeDb([{ id: 'user-2', stripeCustomerId: 'cus_2' }]);
  assert.equal(
    await resolveExistingUserIdFromSubscription(db, { metadata: {}, customer: 'cus_2' }),
    'user-2',
  );
  assert.equal(
    await resolveExistingUserIdFromSubscription(db, { metadata: {}, customer: 'cus_missing' }),
    null,
  );
});

test('customer lookup fails closed without a database or customer id', async () => {
  const db = fakeDb([]);
  assert.equal(await resolveExistingUserIdFromCustomer(db, ''), null);
  assert.equal(await resolveExistingUserIdFromCustomer(null, 'cus_1'), null);
});
