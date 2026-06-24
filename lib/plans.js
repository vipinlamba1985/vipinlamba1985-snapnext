// SnapNext AI plan configuration — single source of truth for limits & Stripe price IDs.
//
// Notes:
//  - `super_user` is bypassed everywhere via isSuper() and never goes through billing.
//  - `prices.monthly.stripePriceId` / `.yearly.stripePriceId` come from env vars so the same
//    code works in dev (mock) and prod (Stripe).

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    tier: 0,
    storageBytes: 15 * 1024 * 1024 * 1024,        // 15 GB
    aiPerDay: 10,
    aiPerMonth: 200,
    downloadsPerDay: 20,
    maxUploadBytes: 100 * 1024 * 1024,             // 100 MB single-shot
    features: ['Basic gallery', 'Limited AI captions', '15 GB storage'],
    color: 'from-slate-500 to-slate-700',
    prices: {
      monthly: { amount: 0, stripePriceId: null },
      yearly:  { amount: 0, stripePriceId: null },
    },
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    tier: 1,
    storageBytes: 100 * 1024 * 1024 * 1024,       // 100 GB
    aiPerDay: 100,
    aiPerMonth: 2000,
    downloadsPerDay: 200,
    maxUploadBytes: 500 * 1024 * 1024,            // 500 MB
    features: ['100 GB storage', 'More AI captions', 'Favorite sharing', 'Larger downloads'],
    color: 'from-fuchsia-500 to-purple-600',
    popular: false,
    prices: {
      monthly: { amount: 4.99, stripePriceId: process.env.STRIPE_PRICE_PLUS_MONTHLY || null },
      yearly:  { amount: 49.99, stripePriceId: process.env.STRIPE_PRICE_PLUS_YEARLY || null },
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro · Family',
    tier: 2,
    storageBytes: 1024 * 1024 * 1024 * 1024,      // 1 TB
    aiPerDay: 1000,
    aiPerMonth: 20000,
    downloadsPerDay: 2000,
    maxUploadBytes: 5 * 1024 * 1024 * 1024,       // 5 GB
    features: ['1 TB storage', 'Family / Favorites', 'Advanced AI', 'Priority export'],
    color: 'from-pink-500 via-fuchsia-500 to-indigo-600',
    popular: true,
    prices: {
      monthly: { amount: 9.99, stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || null },
      yearly:  { amount: 99.99, stripePriceId: process.env.STRIPE_PRICE_PRO_YEARLY || null },
    },
  },
  super_user: {
    id: 'super_user',
    name: 'Super User',
    tier: 99,
    storageBytes: Number.MAX_SAFE_INTEGER,
    aiPerDay: Number.MAX_SAFE_INTEGER,
    aiPerMonth: Number.MAX_SAFE_INTEGER,
    downloadsPerDay: Number.MAX_SAFE_INTEGER,
    maxUploadBytes: Number.MAX_SAFE_INTEGER,
    features: ['Unlimited storage', 'Unlimited AI', 'All features', 'Admin access'],
    color: 'from-amber-400 via-orange-500 to-rose-500',
    prices: { monthly: { amount: 0, stripePriceId: null }, yearly: { amount: 0, stripePriceId: null } },
  },
};

export function getPlan(planId) {
  return PLANS[planId] || PLANS.free;
}

export function isSuper(user) {
  return user?.plan === 'super_user' || user?.role === 'admin';
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
  return ['plus', 'pro'].some(id => !!PLANS[id].prices.monthly.stripePriceId || !!PLANS[id].prices.yearly.stripePriceId);
}
