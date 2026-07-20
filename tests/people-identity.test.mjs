import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnknownPerson, normalizePeopleIdentityState, sortPeopleForDisplay } from '../lib/people-identity.js';

test('unknown identity state is explicit and safe by default', () => {
  assert.equal(normalizePeopleIdentityState('unknown'), 'unknown');
  assert.equal(normalizePeopleIdentityState('person'), 'person');
  assert.equal(normalizePeopleIdentityState('anything-else'), 'person');
  assert.equal(isUnknownPerson({ identityState: 'unknown' }), true);
  assert.equal(isUnknownPerson({}), false);
});

test('self appears first, active people follow, and unknown faces move to the end', () => {
  const people = [
    { name: 'unknown-face', identityState: 'unknown', count: 99 },
    { name: 'inactive', verificationStatus: 'confirmed', count: 50 },
    { name: 'review', verificationStatus: 'suggested', count: 10 },
    { name: 'active', verificationStatus: 'confirmed', count: 2 },
    { name: 'self-face', isSelf: true, verificationStatus: 'confirmed', count: 1 },
  ];
  assert.deepEqual(
    sortPeopleForDisplay(people, ['active']).map((person) => person.name),
    ['self-face', 'active', 'review', 'inactive', 'unknown-face'],
  );
});

test('People ordering supports the all-memories activation view object', () => {
  const enabled = { length: 0, includes: (name) => name === 'active' };
  assert.deepEqual(
    sortPeopleForDisplay([{ name: 'inactive' }, { name: 'active' }], enabled).map((person) => person.name),
    ['active', 'inactive'],
  );
});
