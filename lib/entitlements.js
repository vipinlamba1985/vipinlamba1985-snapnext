import { PLANS } from '@/lib/plans';
export { PLANS } from '@/lib/plans';


export function isSuperUser(user) {
  return user?.plan === 'super_user' || user?.role === 'admin';
}

export function effectivePlanId(user) {
  if (isSuperUser(user)) return 'super_user';
  return PLANS[user?.plan]?.id || 'free';
}

export function effectivePlan(user) {
  return PLANS[effectivePlanId(user)] || PLANS.free;
}

export function entitlementForUser(user) {
  const isSuper = isSuperUser(user);
  const plan = effectivePlan(user);
  return {
    isSuper,
    role: user?.role || 'user',
    rawPlan: user?.plan || 'free',
    planId: plan.id,
    plan,
    label: isSuper ? 'Super User' : plan.name,
    badge: isSuper ? 'Super User · Family Access' : plan.name,
  };
}
