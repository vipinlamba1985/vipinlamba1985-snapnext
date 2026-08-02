import { PLANS, yearlySavings } from './plans.js';

const DESCRIPTIONS = Object.freeze({
  free: 'Start your private memory home with essential backup and organization.',
  starter: 'A real paid SnapNext experience for everyday memories and ready-to-post help.',
  plus: 'More protected space with AI Studio and favorite sharing.',
  pro: 'Creator-grade AI tools, larger uploads, and priority exports.',
  family: 'A shared private memory vault for the people who matter most.',
});

function publicPrice(plan, interval) {
  const amount = Number(plan.prices?.[interval]?.amount || 0);
  return {
    amount,
    // Billing needs a truthy readiness signal. `inline` means Checkout will use
    // recurring price_data from plans.js instead of a pre-created Stripe Price.
    stripePriceId: plan.prices?.[interval]?.stripePriceId || (amount > 0 ? 'inline' : null),
    checkoutMode: plan.prices?.[interval]?.stripePriceId ? 'configured_price' : amount > 0 ? 'inline_price' : 'free',
  };
}

export function publicPlans() {
  return Object.values(PLANS)
    .filter((plan) => plan.id !== 'super_user')
    .sort((left, right) => left.tier - right.tier)
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      tier: plan.tier,
      price: Number(plan.prices?.monthly?.amount || 0),
      storageGb: Math.round(plan.storageBytes / 1024 ** 3),
      description: DESCRIPTIONS[plan.id] || '',
      features: [...(plan.features || [])],
      prices: {
        monthly: publicPrice(plan, 'monthly'),
        yearly: publicPrice(plan, 'yearly'),
      },
      popular: plan.popular === true,
      // Yearly-only plans hide the monthly option rather than offering a price
      // that checkout would reject; the saving is shown so the annual choice is
      // encouraged with a real number rather than a slogan.
      yearlyOnly: plan.yearlyOnly === true,
      savings: yearlySavings(plan.id),
      maxUploadBytes: plan.maxUploadBytes,
      aiFeatures: { ...(plan.aiFeatures || {}) },
    }));
}
