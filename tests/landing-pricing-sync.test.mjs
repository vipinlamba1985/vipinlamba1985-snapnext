import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('landing pricing is rendered from the live public plan catalogue', () => {
  const page = fs.readFileSync('app/page.js', 'utf8');
  const pricing = fs.readFileSync('components/marketing/LivePricingPortal.js', 'utf8');
  assert.match(page, /LivePricingPortal/);
  assert.match(page, /data-live-pricing-ready/);
  assert.match(pricing, /fetch\('\/api\/plans'\)/);
  assert.match(pricing, /plan\.prices\?\.monthly/);
  assert.match(pricing, /plan\.storageGb/);
});

test('server-rendered pricing remains visible until a complete live catalogue is ready', () => {
  assert.equal(fs.existsSync('components/marketing/CurrentLandingPage.js'), true);
  const page = fs.readFileSync('app/page.js', 'utf8');
  const pricing = fs.readFileSync('components/marketing/LivePricingPortal.js', 'utf8');
  assert.match(page, /#pricing\[data-live-pricing-ready="true"\]/);
  assert.doesNotMatch(page, /#pricing > div:not/);
  assert.match(pricing, /nextPlans\.length/);
  assert.match(pricing, /dataset\.livePricingReady = 'true'/);
  assert.match(pricing, /Keep the server-rendered pricing fallback visible/);
});
