import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('restoration catalog sells bounded USD packs and conservative recipes', () => {
  const catalog = read('lib/restoration/catalog.js');
  assert.match(catalog, /RESTORATION_CURRENCY \|\| 'usd'/);
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

test('restoration checkout is a verified one-time Stripe payment and pauses before provider readiness', () => {
  const checkout = read('lib/restoration/checkout.js');
  const provider = read('lib/restoration/provider.js');
  assert.match(checkout, /mode: 'payment'/);
  assert.match(checkout, /purchaseType: 'restoration_pack'/);
  assert.match(checkout, /payment_intent_data/);
  assert.match(checkout, /isRestorationProviderReady/);
  assert.match(checkout, /STRIPE_WEBHOOK_SECRET/);
  assert.match(checkout, /currency !== 'usd'/);
  assert.match(checkout, /amount_total/);
  assert.match(checkout, /restoration_checkout_amount_mismatch/);
  assert.doesNotMatch(checkout, /allow_promotion_codes/);
  assert.match(provider, /RESTORATION_OUTPUT_HOSTS/);
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
  assert.match(registry, /maxCostUsd: 0\.06/);
  assert.match(registry, /maxAttempts: 1/);
  assert.match(spendGate, /metadata\?\.billingPolicy === 'prepaid'/);
  assert.match(spendGate, /reserveAiSpend/);
  assert.match(spendGate, /prepaid_and_profit_guard_approved/);
});

test('restoration route preserves originals, charges Restoration Credits, and saves one derived copy', () => {
  const route = read('app/api/restoration/route.js');
  assert.match(route, /executeAiGatewayTask/);
  assert.match(route, /taskId: 'photo_restore'/);
  assert.match(route, /approved !== true/);
  assert.match(route, /reserveRestorationUnits/);
  assert.match(route, /settleRestorationUnits/);
  assert.match(route, /releaseRestorationUnits/);
  assert.match(route, /billingPolicy: 'prepaid'/);
  assert.match(route, /derivedFrom: source\.id/);
  assert.match(route, /restoration\.jobId/);
  assert.match(route, /status: 'saving'/);
  assert.match(route, /storage\.remove/);
  assert.match(route, /preserveOriginal: true/);
  assert.match(route, /aiCreditsUsed: 0/);
  assert.match(route, /Restored Photos/);
  assert.match(route, /maxDuration = 180/);
});

test('stale restoration reservations self-release and active jobs block overlap', () => {
  const reconcile = read('lib/restoration/reconcile.js');
  const route = read('app/api/restoration/route.js');
  assert.match(reconcile, /RESTORATION_RESERVATION_TTL_MINUTES/);
  assert.match(reconcile, /releaseRestorationUnits/);
  assert.match(reconcile, /stale_restoration_recovered/);
  assert.match(route, /releaseStaleRestorationReservations/);
  assert.match(route, /findActiveRestorationJob/);
  assert.match(route, /restoration_in_progress/);
});

test('restoration provider URLs stay server-side behind an authenticated preview proxy', () => {
  const route = read('app/api/restoration/route.js');
  const preview = read('app/api/restoration/[id]/preview/route.js');
  const page = read('app/(app)/ai-studio/restoration/page.js');
  assert.match(route, /safe\.previewUrl/);
  assert.doesNotMatch(route, /safe\.outputUrl/);
  assert.match(preview, /getUserFromRequest/);
  assert.match(preview, /downloadRestorationOutput/);
  assert.match(preview, /Cache-Control': 'private, no-store/);
  assert.match(page, /job\?\.previewUrl/);
  assert.doesNotMatch(page, /job\?\.outputUrl/);
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

test('restoration UI exposes purchase, confirmation, before-after, save, and native billing guard', () => {
  const page = read('app/(app)/ai-studio/restoration/page.js');
  const studio = read('app/(app)/ai-studio/page.js');
  assert.match(page, /Restoration Credit packs/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /Before and after/);
  assert.match(page, /Save restored copy/);
  assert.match(page, /original photo will stay untouched/i);
  assert.match(page, /Capacitor\.isNativePlatform/);
  assert.match(page, /Pack purchases are hidden in this native build/);
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
