import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('landing pricing is rendered from the live public plan catalogue', () => {
  const page = fs.readFileSync('app/page.js', 'utf8');
  const pricing = fs.readFileSync('components/marketing/LivePricingPortal.js', 'utf8');
  assert.match(page, /LivePricingPortal/);
  assert.match(page, /data-snapnext-live-pricing/);
  assert.match(pricing, /fetch\('\/api\/plans'\)/);
  assert.match(pricing, /plan\.prices\?\.monthly/);
  assert.match(pricing, /plan\.storageGb/);
});

test('the previous landing implementation is preserved while its old pricing block is hidden', () => {
  assert.equal(fs.existsSync('components/marketing/CurrentLandingPage.js'), true);
  const page = fs.readFileSync('app/page.js', 'utf8');
  assert.match(page, /#pricing > div:not\(\[data-snapnext-live-pricing\]\)/);
});
