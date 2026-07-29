import { PLANS } from './plans.js';

const DESCRIPTIONS = Object.freeze({
  free: 'Start your private memory home with essential backup and organization.',
  starter: 'A real paid SnapNext experience for everyday memories and ready-to-post help.',
  plus: 'More protected space with AI Studio and favorite sharing.',
  pro: 'Creator-grade AI tools, larger uploads, and priority exports.',
  family: 'A shared private memory vault for the people who matter most.',
});

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
        monthly: {
          amount: Number(plan.prices?.monthly?.amount || 0),
          stripePriceId: plan.prices?.monthly?.stripePriceId || null,
        },
        yearly: {
          amount: Number(plan.prices?.yearly?.amount || 0),
          stripePriceId: plan.prices?.yearly?.stripePriceId || null,
        },
      },
      popular: plan.popular === true,
      maxUploadBytes: plan.maxUploadBytes,
      aiFeatures: { ...(plan.aiFeatures || {}) },
    }));
}
