import test from 'node:test';
import assert from 'node:assert/strict';
import { closestFaceIndex, faceBoxDistance, replaceActiveCluster } from '../lib/people-recovery.js';

test('closestFaceIndex selects the indexed face nearest the recovered representative face', () => {
  const target = { Left: 0.1, Top: 0.2, Width: 0.2, Height: 0.25 };
  const rows = [
    { clusterId: 'far', boundingBox: { Left: 0.7, Top: 0.2, Width: 0.2, Height: 0.25 } },
    { clusterId: 'match', boundingBox: { Left: 0.11, Top: 0.19, Width: 0.21, Height: 0.24 } },
  ];
  assert.equal(closestFaceIndex(rows, target)?.clusterId, 'match');
  assert.ok(faceBoxDistance(rows[1].boundingBox, target) < faceBoxDistance(rows[0].boundingBox, target));
});

test('closestFaceIndex ignores unusable rows', () => {
  assert.equal(closestFaceIndex([{ clusterId: '', boundingBox: {} }, { clusterId: 'missing-box' }], {}), null);
});

test('replaceActiveCluster swaps a recovered legacy id without creating duplicates', () => {
  assert.deepEqual(replaceActiveCluster(['legacy', 'friend', 'real'], 'legacy', 'real'), ['real', 'friend']);
  assert.deepEqual(replaceActiveCluster(['friend'], 'legacy', 'real'), ['friend']);
});
