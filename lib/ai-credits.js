import { PLANS } from '@/lib/plans';

export const AI_CREDIT_ALLOWANCES = Object.freeze({
  free: 20,
  plus: 80,
  pro: 180,
  family: 280,
  super_user: 2000,
});

export function weeklyAiCreditsForPlan(planId) {
  const key = String(planId || 'free').toLowerCase();
  return Math.max(0, Number(AI_CREDIT_ALLOWANCES[key] ?? AI_CREDIT_ALLOWANCES.free));
}

export function walletAmountToAiCredits(valueUsd, weeklyLimitUsd, planId) {
  const credits = weeklyAiCreditsForPlan(planId);
  const limit = Math.max(0, Number(weeklyLimitUsd) || 0);
  const value = Math.max(0, Number(valueUsd) || 0);
  if (!credits || !limit || !value) return 0;
  return Math.min(credits, Math.max(0, Math.round((value / limit) * credits)));
}

export function aiCreditPlanSummary() {
  return Object.values(PLANS)
    .filter((plan) => plan.id !== 'super_user')
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      weeklyCredits: weeklyAiCreditsForPlan(plan.id),
      estimatedMonthlyCredits: weeklyAiCreditsForPlan(plan.id) * 4,
    }));
}

export const AI_CREDIT_EXAMPLES = [
  { feature: 'Cached intelligence', credits: 0, note: 'Previously analyzed memories never use credits again.' },
  { feature: 'Photo understanding', credits: 5, note: 'Maximum reservation; unused capacity is released after settlement.' },
  { feature: 'Short video understanding', credits: 30, note: 'Only when the plan includes video AI.' },
  { feature: 'Voice transcription', credits: 25, note: 'Maximum reservation; provider failures are refunded.' },
  { feature: 'Voice response', credits: 10, note: 'Maximum reservation.' },
];
