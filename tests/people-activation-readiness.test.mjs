import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { peopleActivationReadiness, PEOPLE_ACTIVATION_GATE_IDS } from '../lib/intelligence/people-activation-readiness.js';

test('production People activation is blocked until every real-world gate is attested', () => {
  const state = peopleActivationReadiness({ NODE_ENV: 'production' });
  assert.equal(state.required, true);
  assert.equal(state.ready, false);
  assert.deepEqual(state.missing, ['aws_permission', 'backup_restore', 'physical_device_qa']);
});

test('production People activation opens only when all three attestations are true', () => {
  const state = peopleActivationReadiness({
    NODE_ENV: 'production',
    PEOPLE_ACTIVATION_AWS_VERIFIED: 'true',
    PEOPLE_ACTIVATION_BACKUP_RESTORE_VERIFIED: '1',
    PEOPLE_ACTIVATION_DEVICE_QA_VERIFIED: 'yes',
  });
  assert.equal(state.ready, true);
  assert.deepEqual(state.missing, []);
  assert.ok(state.gates.every((gate) => gate.verified));
});

test('one missing production attestation keeps paid recognition fail closed', () => {
  const state = peopleActivationReadiness({
    NODE_ENV: 'production',
    PEOPLE_ACTIVATION_AWS_VERIFIED: 'true',
    PEOPLE_ACTIVATION_BACKUP_RESTORE_VERIFIED: 'true',
    PEOPLE_ACTIVATION_DEVICE_QA_VERIFIED: 'false',
  });
  assert.equal(state.ready, false);
  assert.deepEqual(state.missing, ['physical_device_qa']);
});

test('development and test environments can exercise the feature without fake production attestations', () => {
  for (const NODE_ENV of ['development', 'test', undefined]) {
    const state = peopleActivationReadiness({ NODE_ENV });
    assert.equal(state.required, false);
    assert.equal(state.ready, true);
  }
});

test('public readiness shape exposes gate state but never environment variable names or values', () => {
  const state = peopleActivationReadiness({
    NODE_ENV: 'production',
    PEOPLE_ACTIVATION_AWS_VERIFIED: 'super-secret-looking-value',
  });
  const serialized = JSON.stringify(state);
  assert.deepEqual(PEOPLE_ACTIVATION_GATE_IDS, ['aws_permission', 'backup_restore', 'physical_device_qa']);
  assert.doesNotMatch(serialized, /PEOPLE_ACTIVATION_/);
  assert.doesNotMatch(serialized, /super-secret-looking-value/);
});

test('production config gates cloud recognition without blocking the independent local face gate', () => {
  const source = fs.readFileSync('lib/intelligence/config.js', 'utf8');
  assert.match(source, /faceProcessingRequested/);
  assert.match(source, /faceProcessingEnabled: faceProcessingRequested && activation\.ready/);
  assert.match(source, /localFaceGateEnabled: booleanEnv\(env, 'LOCAL_FACE_GATE_ENABLED', false\)/);
  assert.match(source, /peopleActivationMissing: activation\.missing/);
});
