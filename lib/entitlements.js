import { PLANS as BASE_PLANS } from '@/lib/plans';

export const DEV_EFFECTIVE_PLAN_COOKIE = 'snapnext_dev_effective_plan';

export const DEV_PLAN_IDS = ['free', 'plus', 'pro', 'family', 'super_user'];

export const ENTITLEMENT_PLANS = Object.freeze({
  ...BASE_PLANS,
  family: {
    id: 'family',
    name: 'Family',
    tier: 3,
    storageBytes: 2 * 1024 * 1024 * 1024 * 1024,
    aiPerDay: 2500,
    aiPerMonth: 50000,
    downloadsPerDay: 5000,
    maxUploadBytes: 8 * 1024 * 1024 * 1024,
    features: ['2 TB family vault', 'Family sharing', 'People sync', 'Community albums', 'Priority AI'],
    color: 'from-sky-400 via-cyan-500 to-emerald-500',
    prices: { monthly: { amount: 0, stripePriceId: null }, yearly: { amount: 0, stripePriceId: null } },
    developerOnly: true,
  },
});

export { ENTITLEMENT_PLANS as PLANS };

export function hasRealSuperAccess(user) {
  return user?.plan === 'super_user' || user?.role === 'admin';
}

export function isSuper(user, request) {
  if (request) return getEffectivePlan(user, request) === 'super_user';
  return hasRealSuperAccess(user);
}

export const isSuperUser = isSuper;

export function normalizePlanId(planId) {
  return DEV_PLAN_IDS.includes(planId) ? planId : null;
}

export function getDeveloperPlanOverride(request) {
  const cookieValue = request?.cookies?.get?.(DEV_EFFECTIVE_PLAN_COOKIE)?.value;
  return normalizePlanId(cookieValue);
}

export function realPlanId(user) {
  if (isSuper(user)) return 'super_user';
  return ENTITLEMENT_PLANS[user?.plan]?.id || 'free';
}

export function getEffectivePlan(user, request) {
  const override = getDeveloperPlanOverride(request);
  if (override && isSuper(user)) return override;
  return realPlanId(user);
}

export function getEffectivePlanConfig(user, request) {
  const planId = getEffectivePlan(user, request);
  return ENTITLEMENT_PLANS[planId] || ENTITLEMENT_PLANS.free;
}

export function effectivePlanId(user, request) {
  return getEffectivePlan(user, request);
}

export function effectivePlan(user, request) {
  return getEffectivePlanConfig(user, request);
}

export function canUseFeature(user, feature, request) {
  const plan = getEffectivePlanConfig(user, request);
  if (plan.id === 'super_user') return true;
  if (!feature) return true;
  return plan.features?.some((item) => item.toLowerCase().includes(String(feature).toLowerCase())) || false;
}

export function entitlementForUser(user, request) {
  const realPlan = realPlanId(user);
  const planId = getEffectivePlan(user, request);
  const plan = ENTITLEMENT_PLANS[planId] || ENTITLEMENT_PLANS.free;
  const overrideActive = isSuper(user) && !!getDeveloperPlanOverride(request) && planId !== realPlan;
  const realIsSuper = isSuper(user);
  return {
    isSuper: plan.id === 'super_user',
    realIsSuper,
    role: user?.role || 'user',
    rawPlan: user?.plan || 'free',
    realPlan,
    planId: plan.id,
    plan,
    effectivePlan: plan.id,
    overrideActive,
    label: plan.name,
    badge: overrideActive ? `Testing as ${plan.name}` : (realIsSuper ? 'Super User · Family Access' : plan.name),
    allowedPlans: realIsSuper ? DEV_PLAN_IDS : [],
  };
}

export function createDevOverrideCookie(plan) {
  return `${DEV_EFFECTIVE_PLAN_COOKIE}=${encodeURIComponent(plan)}; Path=/; Max-Age=604800; SameSite=Lax; HttpOnly${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function clearDevOverrideCookie() {
  return `${DEV_EFFECTIVE_PLAN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
