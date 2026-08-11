const GATES = Object.freeze([
  Object.freeze({
    id: 'aws_permission',
    env: 'PEOPLE_ACTIVATION_AWS_VERIFIED',
    label: 'AWS Rekognition DescribeCollection permission verified',
  }),
  Object.freeze({
    id: 'backup_restore',
    env: 'PEOPLE_ACTIVATION_BACKUP_RESTORE_VERIFIED',
    label: 'Database and object-storage backup/restore behavior verified',
  }),
  Object.freeze({
    id: 'physical_device_qa',
    env: 'PEOPLE_ACTIVATION_DEVICE_QA_VERIFIED',
    label: 'Signed-in physical iOS/Android face-count flow verified',
  }),
]);

function enabled(env, name) {
  const raw = env?.[name];
  if (raw === undefined || raw === null || raw === '') return false;
  return ['1', 'true', 'on', 'yes'].includes(String(raw).trim().toLowerCase());
}

/**
 * Production-only operator interlock for paid cloud People recognition.
 *
 * These flags are attestations, not automatic infrastructure discovery. They
 * must be set only after the corresponding real-world check has actually been
 * completed. Returning gate ids/labels (never env values) makes the status safe
 * to expose to authenticated operator tooling later.
 */
export function peopleActivationReadiness(env = process.env) {
  const production = String(env?.NODE_ENV || '').toLowerCase() === 'production';
  const gates = GATES.map((gate) => Object.freeze({
    id: gate.id,
    label: gate.label,
    verified: enabled(env, gate.env),
  }));
  const missing = gates.filter((gate) => !gate.verified).map((gate) => gate.id);

  return Object.freeze({
    production,
    required: production,
    ready: !production || missing.length === 0,
    missing: Object.freeze(missing),
    gates: Object.freeze(gates),
  });
}

export const PEOPLE_ACTIVATION_GATE_IDS = Object.freeze(GATES.map((gate) => gate.id));
