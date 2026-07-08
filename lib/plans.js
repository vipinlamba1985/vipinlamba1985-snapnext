// SnapNext AI plan configuration — single source of truth for limits, feature access & Stripe price IDs.
//
// Product strategy:
//  - Free proves the core memory value without paid external AI spend.
//  - Plus is the accessible everyday tier and unlocks AI Studio.
//  - Pro is the creator/power-user tier and unlocks AI Video + AI Command.
//  - Family adds a shared 2 TB vault and the full AI toolset for households.
//  - `super_user` remains a non-billable administrative/testing override.

export const PLANS = {
  free: {
    id: 'free', name: 'Free', tier: 0,
    storageBytes: 15 * 1024 ** 3,
    aiPerDay: 10, aiPerMonth: 200, downloadsPerDay: 20,
    weeklyExternalAiUsd: 0,
    maxUploadBytes: 100 * 1024 ** 2,
    features: ['15 GB storage', 'Local & internal AI organization', 'Memory search', 'Basic gallery & memories'],
    aiFeatures: { chat: true, studio: false, video: false, command: false },
    color: 'from-slate-500 to-slate-700',
    prices: { monthly: { amount: 0, stripePriceId: null }, yearly: { amount: 0, stripePriceId: null } },
  },
  plus: {
    id: 'plus', name: 'Plus', tier: 1,
    storageBytes: 100 * 1024 ** 3,
    aiPerDay: 100, aiPerMonth: 2000, downloadsPerDay: 200,
    weeklyExternalAiUsd: 0.08,
    maxUploadBytes: 500 * 1024 ** 2,
    features: ['100 GB storage', 'AI Studio', 'Weekly external AI allowance', 'Favorite sharing', 'Larger downloads'],
    aiFeatures: { chat: true, studio: true, video: false, command: false },
    color: 'from-fuchsia-500 to-purple-600', popular: false,
    prices: {
      monthly: { amount: 4.99, stripePriceId: process.env.STRIPE_PRICE_PLUS_MONTHLY || null },
      yearly: { amount: 49.99, stripePriceId: process.env.STRIPE_PRICE_PLUS_YEARLY || null },
    },
  },
  pro: {
    id: 'pro', name: 'Pro', tier: 2,
    storageBytes: 1024 ** 4,
    aiPerDay: 1000, aiPerMonth: 20000, downloadsPerDay: 2000,
    weeklyExternalAiUsd: 0.18,
    maxUploadBytes: 5 * 1024 ** 3,
    features: ['1 TB storage', 'AI Studio + AI Video', 'AI Command', 'Higher weekly external AI allowance', 'Priority export'],
    aiFeatures: { chat: true, studio: true, video: true, command: true },
    color: 'from-pink-500 via-fuchsia-500 to-indigo-600', popular: true,
    prices: {
      monthly: { amount: 9.99, stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || null },
      yearly: { amount: 99.99, stripePriceId: process.env.STRIPE_PRICE_PRO_YEARLY || null },
    },
  },
  family: {
    id: 'family', name: 'Family', tier: 3,
    storageBytes: 2 * 1024 ** 4,
    aiPerDay: 2500, aiPerMonth: 50000, downloadsPerDay: 5000,
    weeklyExternalAiUsd: 0.28,
    maxUploadBytes: 8 * 1024 ** 3,
    features: ['2 TB family vault', 'Full SnapNext AI suite', 'Largest weekly external AI allowance', 'Family & Favorite sharing', 'People sync & shared albums'],
    aiFeatures: { chat: true, studio: true, video: true, command: true },
    color: 'from-sky-400 via-cyan-500 to-emerald-500',
    prices: {
      monthly: { amount: 14.99, stripePriceId: process.env.STRIPE_PRICE_FAMILY_MONTHLY || null },
      yearly: { amount: 149.99, stripePriceId: process.env.STRIPE_PRICE_FAMILY_YEARLY || null },
    },
  },
  super_user: {
    id: 'super_user', name: 'Super User', tier: 99,
    storageBytes: Number.MAX_SAFE_INTEGER,
    aiPerDay: Number.MAX_SAFE_INTEGER, aiPerMonth: Number.MAX_SAFE_INTEGER,
    weeklyExternalAiUsd: 2,
    downloadsPerDay: Number.MAX_SAFE_INTEGER, maxUploadBytes: Number.MAX_SAFE_INTEGER,
    features: ['Unlimited storage', 'All AI features', 'All features', 'Admin access'],
    aiFeatures: { chat: true, studio: true, video: true, command: true },
    color: 'from-amber-400 via-orange-500 to-rose-500',
    prices: { monthly: { amount: 0, stripePriceId: null }, yearly: { amount: 0, stripePriceId: null } },
  },
};

export function getPlan(planId) { return PLANS[planId] || PLANS.free; }

export function isSuper(user) { return user?.plan === 'super_user' || user?.role === 'admin'; }

export function canUseAiFeature(planId, feature) {
  const plan = getPlan(planId);
  return plan.aiFeatures?.[feature] === true;
}

/** Reverse map: stripePriceId -> { planId, interval } for webhook dispatch. */
export function planFromStripePrice(priceId) {
  if (!priceId) return null;
  for (const p of Object.values(PLANS)) {
    if (p.prices.monthly.stripePriceId === priceId) return { planId: p.id, interval: 'monthly' };
    if (p.prices.yearly.stripePriceId === priceId) return { planId: p.id, interval: 'yearly' };
  }
  return null;
}

/** Returns true if at least one paid plan has Stripe price IDs configured. */
export function hasAnyStripePrices() {
  return ['plus', 'pro', 'family'].some(id => !!PLANS[id].prices.monthly.stripePriceId || !!PLANS[id].prices.yearly.stripePriceId);
}
