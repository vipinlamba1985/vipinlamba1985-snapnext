import test from 'node:test';
import assert from 'node:assert/strict';
import { assertE2EECanActivate, evaluateE2EEReleaseReadiness } from '../lib/chat-e2ee-release-gate.js';

const complete = {
  deviceProtectedKeys: true,
  multiDeviceRecovery: true,
  membershipKeyRotation: true,
  encryptedAttachments: true,
  e2eeAwareMutations: true,
  consentBasedAbuseReporting: true,
  interoperabilityTests: true,
  independentSecurityReview: true,
};

test('E2EE remains blocked while any production gate is missing', () => {
  const readiness = evaluateE2EEReleaseReadiness({ ...complete, encryptedAttachments: false });
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missing, ['encryptedAttachments']);
  assert.throws(() => assertE2EECanActivate({ enabled: true, readiness: { ...complete, encryptedAttachments: false } }), /activation blocked/i);
});

test('E2EE can activate only when every production gate is complete', () => {
  assert.deepEqual(assertE2EECanActivate({ enabled: true, readiness: complete }), { enabled: true, ready: true });
});

test('disabled E2EE never claims readiness', () => {
  assert.deepEqual(assertE2EECanActivate({ enabled: false, readiness: complete }), { enabled: false, ready: false });
});
