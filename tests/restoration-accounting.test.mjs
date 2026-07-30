import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('restoration usage records the selected recipe units', () => {
  const route = read('app/api/restoration/route.js');
  assert.match(route, /restorationUnits = 0/);
  assert.match(route, /restorationCredits: status === 'success'/);
  assert.match(route, /restorationUnits: recipe\.units/);
  assert.match(route, /restorationCreditsUsed: recipe\.units/);
  assert.match(route, /unitsReserved: recipe\.units/);
});

test('provider expiry remains optional, valid, and bounded by SnapNext retention', () => {
  const provider = read('lib/restoration/provider.js');
  const route = read('app/api/restoration/route.js');
  assert.match(provider, /outputExpiresAt/);
  assert.match(route, /boundedOutputExpiry/);
  assert.match(route, /Number\.isFinite\(parsed\.getTime\(\)\)/);
  assert.match(route, /Math\.min\(parsed\.getTime\(\), fallback\.getTime\(\)\)/);
  assert.match(route, /outputRetentionDays: 30/);
});
