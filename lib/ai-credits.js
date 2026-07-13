import { PLANS } from '@/lib/plans';

export const AI_CREDIT_USD = 0.001;

export function usdToAiCredits(value) {
  return Math.max(0, Math.round((Number(value) || 0) / AI_CREDIT_USD));
}

export function aiCreditPlanSummary() {
  return Object.values(PLANS)
    .filter((plan) => plan.id !== 'super_user')
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      weeklyCredits: usdToAiCredits(plan.weeklyExternalAiUsd),
      estimatedMonthlyCredits: usdToAiCredits(plan.weeklyExternalAiUsd) * 4,
    }));
}

export const AI_CREDIT_EXAMPLES = [
  { feature: 'Photo understanding', credits: 5, note: 'Maximum reserved amount; cached results use 0 credits.' },
  { feature: 'Short video understanding', credits: 30, note: 'Only when the plan includes video AI.' },
  { feature: 'Voice transcription', credits: 25, note: 'Varies by request and provider.' },
  { feature: 'Voice response', credits: 10, note: 'Maximum reserved amount.' },
];
