const REQUIRED_GATES = Object.freeze([
  'deviceProtectedKeys',
  'multiDeviceRecovery',
  'membershipKeyRotation',
  'encryptedAttachments',
  'e2eeAwareMutations',
  'consentBasedAbuseReporting',
  'interoperabilityTests',
  'independentSecurityReview',
]);

export function evaluateE2EEReleaseReadiness(input = {}) {
  const status = input && typeof input === 'object' ? input : {};
  const missing = REQUIRED_GATES.filter((gate) => status[gate] !== true);
  return {
    ready: missing.length === 0,
    missing,
    completed: REQUIRED_GATES.filter((gate) => status[gate] === true),
    total: REQUIRED_GATES.length,
  };
}

export function assertE2EECanActivate({ enabled, readiness } = {}) {
  if (!enabled) return { enabled: false, ready: false };
  const result = evaluateE2EEReleaseReadiness(readiness);
  if (!result.ready) {
    throw new Error(`E2EE activation blocked. Missing release gates: ${result.missing.join(', ')}`);
  }
  return { enabled: true, ready: true };
}

export { REQUIRED_GATES as E2EE_REQUIRED_RELEASE_GATES };
