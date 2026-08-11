import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { peopleOperationsStatus } from '../lib/people-operations-status.js';

test('operator People snapshot fails closed and shows safe missing gates in production', () => {
  const status = peopleOperationsStatus({
    NODE_ENV: 'production',
    FACE_PROCESSING_ENABLED: 'true',
    LOCAL_FACE_GATE_ENABLED: 'true',
  });

  assert.equal(status.localFaceGateEnabled, true);
  assert.equal(status.cloudRecognition.requested, true);
  assert.equal(status.cloudRecognition.effective, false);
  assert.equal(status.cloudRecognition.ready, false);
  assert.deepEqual(status.cloudRecognition.missing, ['aws_permission', 'backup_restore', 'physical_device_qa']);
});

test('operator People snapshot distinguishes requested from effective cloud activation', () => {
  const status = peopleOperationsStatus({
    NODE_ENV: 'production',
    FACE_PROCESSING_ENABLED: 'true',
    PEOPLE_ACTIVATION_AWS_VERIFIED: 'true',
    PEOPLE_ACTIVATION_BACKUP_RESTORE_VERIFIED: 'true',
    PEOPLE_ACTIVATION_DEVICE_QA_VERIFIED: 'true',
  });

  assert.equal(status.cloudRecognition.requested, true);
  assert.equal(status.cloudRecognition.ready, true);
  assert.equal(status.cloudRecognition.effective, true);
  assert.deepEqual(status.cloudRecognition.missing, []);
});

test('operator People snapshot never exposes attestation environment names or values', () => {
  const status = peopleOperationsStatus({
    NODE_ENV: 'production',
    PEOPLE_ACTIVATION_AWS_VERIFIED: 'secret-looking-attestation',
  });
  const serialized = JSON.stringify(status);
  assert.doesNotMatch(serialized, /PEOPLE_ACTIVATION_/);
  assert.doesNotMatch(serialized, /secret-looking-attestation/);
});

test('admin operations endpoint keeps People readiness behind real super-user authentication', () => {
  const route = fs.readFileSync('app/api/admin/operations/route.js', 'utf8');
  const authIndex = route.indexOf('getUserFromRequest(request)');
  const superIndex = route.indexOf('isSuperUser(user)');
  const snapshotIndex = route.indexOf('peopleOperationsStatus(process.env)');

  assert.ok(authIndex > 0);
  assert.ok(superIndex > authIndex);
  assert.ok(snapshotIndex > superIndex);
  assert.doesNotMatch(route, /PEOPLE_ACTIVATION_AWS_VERIFIED|PEOPLE_ACTIVATION_BACKUP_RESTORE_VERIFIED|PEOPLE_ACTIVATION_DEVICE_QA_VERIFIED/);
});

test('admin operations UI renders every People readiness gate and no attestation control', () => {
  const page = fs.readFileSync('app/(app)/admin/operations/page.js', 'utf8');
  assert.match(page, /People activation readiness/);
  assert.match(page, /cloudRecognition\.gates/);
  assert.match(page, /cloudRecognition\.requested/);
  assert.match(page, /cloudRecognition\.effective/);
  assert.doesNotMatch(page, /setAttestation|verifyGate|markVerified|PEOPLE_ACTIVATION_/);
});
