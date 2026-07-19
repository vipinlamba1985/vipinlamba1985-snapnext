import test from 'node:test';
import assert from 'node:assert/strict';
import { matchDecision, rekognitionUserId } from '../lib/people-intelligence.js';

test('people confidence zones separate confirmed, suggested and unmatched', () => {
  assert.equal(matchDecision(99.2), 'confirmed');
  assert.equal(matchDecision(95), 'suggested');
  assert.equal(matchDecision(91.99), 'unmatched');
});

test('rekognition user IDs are private stable identifiers', () => {
  assert.equal(rekognitionUserId('abc-123'), 'person_abc-123');
  assert.equal(rekognitionUserId('unsafe/id value'), 'person_unsafe_id_value');
});
