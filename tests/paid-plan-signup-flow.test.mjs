import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('signup preserves an approved paid plan through direct and confirmed-email authentication', () => {
  const signup = fs.readFileSync('app/signup/page.js', 'utf8');
  assert.match(signup, /PAID_PLAN_IDS/);
  assert.match(signup, /starter/);
  assert.match(signup, /family/);
  assert.match(signup, /\/billing\?plan=\$\{encodeURIComponent\(selectedPlan\)\}&checkout=1/);
  assert.match(signup, /router\.replace\(postAuthPath\)/);
  assert.match(signup, /router\.replace\(loginHref\)/);
  assert.match(signup, /\/login\?next=\$\{encodeURIComponent\(postAuthPath\)\}/);
});

test('billing automatically continues only a valid authenticated paid-plan selection', () => {
  const billing = fs.readFileSync('app/(app)/billing/page.js', 'utf8');
  assert.match(billing, /params\.get\('checkout'\) === '1'/);
  assert.match(billing, /checkoutStarted\.current/);
  assert.match(billing, /Capacitor\.isNativePlatform\(\)/);
  assert.match(billing, /requestedPlan\.id === 'free'/);
  assert.match(billing, /checkout\(requestedPlan\.id\)/);
  assert.match(billing, /Selected during signup/);
});
