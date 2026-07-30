import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('restoration catalog sells bounded packs and conservative recipes', () => {
  const catalog = read('lib/restoration/catalog.js');
  assert.match(catalog, /single/);
  assert.match(catalog, /0\.99/);
  assert.match(catalog, /three/);
  assert.match(catalog, /2\.49/);
  assert.match(catalog, /ten/);
  assert.match(catalog, /6\.99/);
  assert.match(catalog, /Repair damage/);
  assert.match(catalog, /Careful colourisation/);
  assert.match(catalog, /Premium repair \+ print/);
  assert.doesNotMatch(catalog, /unlimited/i);
});

test('restoration checkout is a one-time Stripe payment and pauses before provider readiness', () => {
  const checkout = read('lib/restoration/checkout.js');
  assert.match(checkout, /mode: 'payment'/);
  assert.match(checkout, /purchaseType: 'restoration_pack'/);
  assert.match(checkout, /payment_intent_data/);
  assert.match(checkout, /ENHANCE_PHOTO_PROVIDER_URL/);
  assert.match(checkout, /amount_total/);
  assert.match(checkout, /restoration_checkout_amount_mismatch/);
});

test('restoration wallet grants, reserves, settles, releases, and revokes units atomically', () => {
  const wallet = read('lib/restoration/wallet.js');
  assert.match(wallet, /grantIds: \{ \$ne: grantId \}/);
  assert.match(wallet, /availableUnits: \{ \$gte: required \}/);
  assert.match(wallet, /status: 'reserved'/);
  assert.match(wallet, /status: 'settled'/);
  assert.match(wallet, /status: 'released'/);
  assert.match(wallet, /status: 'revoked'/);
  assert.match(wallet, /revokedReservedUnits/);
  assert.match(wallet, /refundedUsedUnits/);
  assert.match(wallet, /returnDocument: 'before'/);
  assert.doesNotMatch(wallet, /status: applied\.modifiedCount \? 'granted' : 'already_granted'/);
});

test('prepaid restoration bypasses only the subscription wallet and still uses Profit Guard', () => {
  const registry = read('lib/ai/registry.js');
  const spendGate = read('lib/ai-spend-gate.js');
  assert.match(registry, /photo_restore/);
  assert.match(registry, /billingPolicy: 'prepaid'/);
  assert.match(registry, /approvalRequired: true/);
  assert.match(spendGate, /metadata\?\.billingPolicy === 'prepaid'/);
  assert.match(spendGate, /reserveAiSpend/);
  assert.match(spendGate, /prepaid_and_profit_guard_approved/);
});

test('restoration route preserves originals, charges Restoration Credits, and saves a derived copy', () => {
  const route = read('app/api/restoration/route.js');
  assert.match(route, /executeAiGatewayTask/);
  assert.match(route, /taskId: 'photo_restore'/);
  assert.match(route, /approved !== true/);
  assert.match(route, /reserveRestorationUnits/);
  assert.match(route, /settleRestorationUnits/);
  assert.match(route, /releaseRestorationUnits/);
  assert.match(route, /billingPolicy: 'prepaid'/);
  assert.match(route, /derivedFrom: source\.id/);
  assert.match(route, /preserveOriginal: true/);
  assert.match(route, /aiCreditsUsed: 0/);
  assert.match(route, /Restored Photos/);
});

test('legacy enhancement API cannot bypass paid old-photo restoration', () => {
  const route = read('app/api/ai-enhance-photo/route.js');
  assert.match(route, /body\.action === 'restore'/);
  assert.match(route, /restoration_pack_required/);
  assert.match(route, /\/ai-studio\/restoration/);
  assert.doesNotMatch(route, /restore: \{ name: 'Restore Old Photo'/);
});

test('Stripe webhook recognizes pack revenue and adjusts restoration purchases separately from subscriptions', () => {
  const route = read('app/api/webhooks/stripe/route.js');
  const webhook = read('lib/restoration/webhook.js');
  assert.match(route, /handleRestorationStripeEvent/);
  assert.match(route, /skippedSubscriptionBilling/);
  assert.match(webhook, /checkout\.session\.completed/);
  assert.match(webhook, /subtype: 'restoration_pack'/);
  assert.match(webhook, /netAmountUsd/);
  assert.match(webhook, /STRIPE_CARD_FIXED_FEE_CENTS/);
  assert.match(webhook, /refund\.created/);
  assert.match(webhook, /charge\.refunded/);
  assert.match(webhook, /charge\.dispute\.created/);
  assert.match(webhook, /revokeRestorationPurchase/);
});

test('restoration UI exposes purchase, confirmation, before-after, and save controls', () => {
  const page = read('app/(app)/ai-studio/restoration/page.js');
  const studio = read('app/(app)/ai-studio/page.js');
  assert.match(page, /Restoration Credit packs/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /Before and after/);
  assert.match(page, /Save restored copy/);
  assert.match(page, /original photo will stay untouched/i);
  assert.match(studio, /create-goal-\$\{id\}/);
  assert.match(studio, /href: '\/ai-studio\/restoration'/);
});

test('account deletion includes restoration jobs, wallets, purchases, and reservations', () => {
  const deletion = read('lib/account-deletion.js');
  assert.match(deletion, /photo_restoration_jobs/);
  assert.match(deletion, /restoration_wallets/);
  assert.match(deletion, /restoration_purchases/);
  assert.match(deletion, /restoration_credit_reservations/);
});
