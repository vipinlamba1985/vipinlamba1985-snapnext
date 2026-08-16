// SnapNext AI plan configuration — single source of truth for limits, feature access & Stripe price IDs.
//
// Sustainable launch strategy:
//  - Free proves the memory value with a small protected AI allowance. 10 GB,
//    not 15: free storage is a permanent cost with no revenue against it, and
//    reaching the cap is also the moment people most often upgrade.
//  - Starter is the $0.99 entry tier for users who want a real paid experience.
//  - Plus is the accessible everyday tier and unlocks AI Studio.
//  - Pro is the creator/power-user tier and unlocks AI Video + AI Command.
//  - Family adds a larger shared vault and the full AI toolset for households.
//  - Storage caps are intentionally below raw full-quota loss levels; expand them only after verified cost data.
//  - Canonical Reel render quotas are intentionally conservative launch gates.
//    Cache hits do not consume a new render; raise these only after measured renderer economics.
//  - `super_user` remains a non-billable administrative/testing override.

export const PLANS = {
  free: {
    id: 'free', name: 'Free', tier: 0,
    storageBytes: 10 * 1024 ** 3,
    aiPerDay: 10, aiPerMonth: 200, downloadsPerDay: 20, reelRendersPerMonth: 1,
    weeklyExternalAiUsd: 0.02,
    maxUploadBytes: 100 * 1024 ** 2,
    features: ['10 GB storage', '20 AI Credits each week', 'Local & internal AI organization', 'Local face detection', 'Memory search', 'Basic gallery & memories'],
    aiFeatures: { chat: true, studio: false, video: false, command: false },
    color: 'from-slate-500 to-slate-700',
    prices: { monthly: { amount: 0, stripePriceId: null }, yearly: { amount: 0, stripePriceId: null } },
  },
  starter: {
    id: 'starter', name: 'Starter', tier: 1,
    storageBytes: 20 * 1024 ** 3,
    aiPerDay: 20, aiPerMonth: 400, downloadsPerDay: 50, reelRendersPerMonth: 3,
    weeklyExternalAiUsd: 0.03,
    maxUploadBytes: 250 * 1024 ** 2,
    features: ['20 GB storage', '30 AI Credits each week', '2 Favourite People', 'Ready-to-post captions', 'Memory search & organization'],
    aiFeatures: { chat: true, studio: false, video: false, command: false },
    color: 'from-violet-500 to-fuchsia-600', popular: false,
    // Yearly only. At $0.99 a month the card processing fee (a fixed ~$0.30
    // plus 2.9%) takes a third of the payment before any storage or AI cost is
    // covered, so the monthly option lost money on every user who used it.
    // Billed once a year, a single fee is charged instead of twelve.
    yearlyOnly: true,
    // $11.88 is twelve months at the $0.99 price point, so the per-month figure
    // shown to the customer is exactly $0.99 rather than an odd number derived
    // from a rounded yearly price.
    prices: { monthly: { amount: null, stripePriceId: null }, yearly: { amount: 11.88, stripePriceId: process.env.STRIPE_PRICE_STARTER_YEARLY || null } },
  },
  plus: {
    id: 'plus', name: 'Plus', tier: 2,
    storageBytes: 75 * 1024 ** 3,
    aiPerDay: 100, aiPerMonth: 2000, downloadsPerDay: 200, reelRendersPerMonth: 10,
    weeklyExternalAiUsd: 0.08,
    maxUploadBytes: 500 * 1024 ** 2,
    features: ['75 GB storage', '80 AI Credits each week', '3 Favourite People', 'AI Studio', 'Favorite sharing', 'Larger downloads'],
    aiFeatures: { chat: true, studio: true, video: false, command: false },
    color: 'from-fuchsia-500 to-purple-600', popular: true,
    prices: { monthly: { amount: 3.99, stripePriceId: process.env.STRIPE_PRICE_PLUS_MONTHLY || null }, yearly: { amount: 39.99, stripePriceId: process.env.STRIPE_PRICE_PLUS_YEARLY || null } },
  },
  pro: {
    id: 'pro', name: 'Pro', tier: 3,
    storageBytes: 200 * 1024 ** 3,
    aiPerDay: 1000, aiPerMonth: 20000, downloadsPerDay: 2000, reelRendersPerMonth: 30,
    weeklyExternalAiUsd: 0.18,
    maxUploadBytes: 2 * 1024 ** 3,
    features: ['200 GB storage', '180 AI Credits each week', '3 Favourite People', 'AI Studio + AI Video', 'AI Command', 'Priority export'],
    aiFeatures: { chat: true, studio: true, video: true, command: true },
    color: 'from-pink-500 via-fuchsia-500 to-indigo-600', popular: false,
    prices: { monthly: { amount: 8.99, stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || null }, yearly: { amount: 89.99, stripePriceId: process.env.STRIPE_PRICE_PRO_YEARLY || null } },
  },
  family: {
    id: 'family', name: 'Family', tier: 4,
    storageBytes: 400 * 1024 ** 3,
    aiPerDay: 2500, aiPerMonth: 50000, downloadsPerDay: 5000, reelRendersPerMonth: 50,
    weeklyExternalAiUsd: 0.28,
    maxUploadBytes: 4 * 1024 ** 3,
    features: ['400 GB family vault', '280 shared AI Credits each week', '3 Favourite People', 'Full SnapNext AI suite', 'Family & Favorite sharing', 'People sync & shared albums'],
    aiFeatures: { chat: true, studio: true, video: true, command: true },
    color: 'from-sky-400 via-cyan-500 to-emerald-500',
    prices: { monthly: { amount: 14.99, stripePriceId: process.env.STRIPE_PRICE_FAMILY_MONTHLY || null }, yearly: { amount: 149.99, stripePriceId: process.env.STRIPE_PRICE_FAMILY_YEARLY || null } },
  },
  super_user: {
    id: 'super_user', name: 'Super User', tier: 99,
    storageBytes: Number.MAX_SAFE_INTEGER,
    aiPerDay: Number.MAX_SAFE_INTEGER, aiPerMonth: Number.MAX_SAFE_INTEGER,
    weeklyExternalAiUsd: 2,
    downloadsPerDay: Number.MAX_SAFE_INTEGER, reelRendersPerMonth: Number.MAX_SAFE_INTEGER, maxUploadBytes: Number.MAX_SAFE_INTEGER,
    features: ['Unlimited storage', 'All AI features', 'All features', 'Admin access'],
    aiFeatures: { chat: true, studio: true, video: true, command: true },
    color: 'from-amber-400 via-orange-500 to-rose-500',
    prices: { monthly: { amount: 0, stripePriceId: null }, yearly: { amount: 0, stripePriceId: null } },
  },
};

export function getPlan(planId) { return PLANS[planId] || PLANS.free; }
export function isSuper(user) { return user?.plan === 'super_user' || user?.role === 'admin'; }
export function canUseAiFeature(planId, feature) { return getPlan(planId).aiFeatures?.[feature] === true; }
export function planFromStripePrice(priceId) {
  if (!priceId) return null;
  for (const p of Object.values(PLANS)) {
    if (p.prices.monthly.stripePriceId === priceId) return { planId: p.id, interval: 'monthly' };
    if (p.prices.yearly.stripePriceId === priceId) return { planId: p.id, interval: 'yearly' };
  }
  return null;
}
export function hasAnyStripePrices() { return ['starter', 'plus', 'pro', 'family'].some(id => !!PLANS[id].prices.monthly.stripePriceId || !!PLANS[id].prices.yearly.stripePriceId); }

/** Whether a plan can actually be bought on this interval. */
export function planSupportsInterval(planId, interval) {
  const plan = PLANS[planId];
  if (!plan || planId === 'free' || planId === 'super_user') return false;
  if (interval === 'monthly' && plan.yearlyOnly) return false;
  return typeof plan.prices?.[interval]?.amount === 'number';
}

/**
 * What a yearly plan works out to per month. Used to show the real per-month
 * value of an annual plan — $9.99 a year reads as expensive next to "$0.99 a
 * month" until it is shown as $0.83 a month.
 */
export function monthlyEquivalent(planId) {
  const yearly = PLANS[planId]?.prices?.yearly?.amount;
  return typeof yearly === 'number' && yearly > 0 ? Math.round((yearly / 12) * 100) / 100 : null;
}

/**
 * What choosing yearly saves against paying monthly for a year.
 * Returns null for plans with no monthly price to compare against.
 */
export function yearlySavings(planId) {
  const plan = PLANS[planId];
  const monthly = plan?.prices?.monthly?.amount;
  const yearly = plan?.prices?.yearly?.amount;
  if (typeof monthly !== 'number' || typeof yearly !== 'number' || monthly <= 0 || yearly <= 0) return null;

  const twelveMonths = monthly * 12;
  const saved = twelveMonths - yearly;
  if (saved <= 0) return null;

  return {
    amount: Math.round(saved * 100) / 100,
    percent: Math.round((saved / twelveMonths) * 100),
    monthsFree: Math.round((saved / monthly) * 10) / 10,
  };
}
