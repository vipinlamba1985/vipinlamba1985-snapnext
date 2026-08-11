import { intelligenceConfig } from './intelligence/config.js';
import { peopleActivationReadiness } from './intelligence/people-activation-readiness.js';

/**
 * Build the read-only People activation snapshot shown to real operators.
 *
 * This intentionally exposes only booleans, safe gate ids/labels and the
 * effective/requested rollout state. It never returns environment variable
 * names or values and it cannot mutate/attest any production gate.
 */
export function peopleOperationsStatus(env = process.env) {
  const config = intelligenceConfig(env);
  const readiness = peopleActivationReadiness(env);

  return Object.freeze({
    localFaceGateEnabled: config.localFaceGateEnabled,
    cloudRecognition: Object.freeze({
      requested: config.faceProcessingRequested,
      effective: config.faceProcessingEnabled,
      ready: readiness.ready,
      missing: readiness.missing,
      gates: readiness.gates,
    }),
    guidance: readiness.ready
      ? 'Production prerequisites are attested. Cloud recognition still requires explicit rollout flags and user consent.'
      : 'Keep cloud People recognition disabled until every listed production prerequisite has real-world evidence.',
  });
}
