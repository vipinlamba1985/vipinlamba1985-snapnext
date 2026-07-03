import { PLANS as BASE_PLANS } from '@/lib/plans';

export const DEV_EFFECTIVE_PLAN_COOKIE = 'snapnext_dev_effective_plan';
export const DEV_PROFILE_COOKIE = 'snapnext_dev_profile';

export const DEV_PLAN_IDS = ['free', 'plus', 'pro', 'family', 'super_user'];
export const DEV_PERSONAS = ['new_user', 'active_user', 'creator', 'family_member', 'photographer', 'business_user', 'content_creator', 'memory_collector', 'power_user'];
export const DEV_STORAGE_STATES = ['empty', '5gb', '100gb', '1tb'];
export const DEV_AI_CREDIT_STATES = ['low', 'half', 'full', 'unlimited'];
export const DEV_NOTIFICATION_STATES = ['none', 'normal', 'heavy'];
export const DEV_FEATURE_FLAGS = ['aiStudio', 'aiVideo', 'aiMemory', 'aiCommand', 'premiumBackup', 'favorites', 'community'];

export const DEV_DEFAULT_PROFILE = Object.freeze({
  experience: 'super_user',
  persona: 'active_user',
  storage: '100gb',
  aiCredits: 'unlimited',
  notifications: 'normal',
  featureFlags: {
    aiStudio: true,
    aiVideo: true,
    aiMemory: true,
    aiCommand: true,
    premiumBackup: true,
    favorites: true,
    community: true,
  },
});

const STORAGE_BYTES = Object.freeze({
  empty: 0,
  '5gb': 5 * 1024 ** 3,
  '100gb': 100 * 1024 ** 3,
  '1tb': 1024 ** 4,
});

const AI_CREDIT_RATIO = Object.freeze({ low: 0.1, half: 0.5, full: 1, unlimited: 1 });

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

function cookieSecureSuffix() {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

export function hasRealSuperAccess(user) {
  return user?.plan === 'super_user' || user?.role === 'admin';
}

export function normalizePlanId(planId) {
  return DEV_PLAN_IDS.includes(planId) ? planId : null;
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function normalizeDeveloperProfile(input = {}) {
  const featureFlags = { ...DEV_DEFAULT_PROFILE.featureFlags };
  const incomingFlags = input?.featureFlags && typeof input.featureFlags === 'object' ? input.featureFlags : {};
  for (const flag of DEV_FEATURE_FLAGS) {
    if (typeof incomingFlags[flag] === 'boolean') featureFlags[flag] = incomingFlags[flag];
  }

  return {
    experience: normalizeChoice(input?.experience || input?.plan, DEV_PLAN_IDS, DEV_DEFAULT_PROFILE.experience),
    persona: normalizeChoice(input?.persona, DEV_PERSONAS, DEV_DEFAULT_PROFILE.persona),
    storage: normalizeChoice(input?.storage, DEV_STORAGE_STATES, DEV_DEFAULT_PROFILE.storage),
    aiCredits: normalizeChoice(input?.aiCredits, DEV_AI_CREDIT_STATES, DEV_DEFAULT_PROFILE.aiCredits),
    notifications: normalizeChoice(input?.notifications, DEV_NOTIFICATION_STATES, DEV_DEFAULT_PROFILE.notifications),
    featureFlags,
  };
}

export function profileFromPlan(plan) {
  return normalizeDeveloperProfile({ ...DEV_DEFAULT_PROFILE, experience: normalizePlanId(plan) || DEV_DEFAULT_PROFILE.experience });
}

export function encodeDeveloperProfile(profile) {
  return Buffer.from(JSON.stringify(normalizeDeveloperProfile(profile))).toString('base64url');
}

export function decodeDeveloperProfile(value) {
  if (!value) return null;
  try {
    return normalizeDeveloperProfile(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    try {
      return normalizeDeveloperProfile(JSON.parse(decodeURIComponent(value)));
    } catch {
      return null;
    }
  }
}

export function getDeveloperProfile(request) {
  const profileCookie = request?.cookies?.get?.(DEV_PROFILE_COOKIE)?.value;
  const profile = decodeDeveloperProfile(profileCookie);
  if (profile) return profile;

  const legacyPlanCookie = request?.cookies?.get?.(DEV_EFFECTIVE_PLAN_COOKIE)?.value;
  const legacyPlan = normalizePlanId(legacyPlanCookie);
  return legacyPlan ? profileFromPlan(legacyPlan) : null;
}

export function getDeveloperPlanOverride(request) {
  return getDeveloperProfile(request)?.experience || null;
}

export function realPlanId(user) {
  if (hasRealSuperAccess(user)) return 'super_user';
  return ENTITLEMENT_PLANS[user?.plan]?.id || 'free';
}

export function getEffectivePlan(user, request) {
  const profile = getDeveloperProfile(request);
  if (profile && hasRealSuperAccess(user)) return profile.experience;
  return realPlanId(user);
}

export function getEffectivePlanConfig(user, request) {
  const planId = getEffectivePlan(user, request);
  return ENTITLEMENT_PLANS[planId] || ENTITLEMENT_PLANS.free;
}

export function isSuper(user, request) {
  if (request) return getEffectivePlan(user, request) === 'super_user';
  return hasRealSuperAccess(user);
}

export const isSuperUser = isSuper;

export function effectivePlanId(user, request) {
  return getEffectivePlan(user, request);
}

export function effectivePlan(user, request) {
  return getEffectivePlanConfig(user, request);
}

export function isFeatureEnabled(feature, request) {
  const profile = getDeveloperProfile(request);
  if (!profile) return true;
  if (!DEV_FEATURE_FLAGS.includes(feature)) return true;
  return profile.featureFlags[feature] !== false;
}

export function canUseFeature(user, feature, request) {
  if (!isFeatureEnabled(feature, request)) return false;
  const plan = getEffectivePlanConfig(user, request);
  if (plan.id === 'super_user') return true;
  if (!feature) return true;
  return plan.features?.some((item) => item.toLowerCase().includes(String(feature).toLowerCase())) || false;
}

export function getSimulatedStorageBytes(request) {
  const profile = getDeveloperProfile(request);
  return profile ? STORAGE_BYTES[profile.storage] : null;
}

export function applyStorageSimulation(usage, request) {
  const simulatedBytes = getSimulatedStorageBytes(request);
  if (simulatedBytes === null || simulatedBytes === undefined) return usage;
  return { ...usage, bytes: simulatedBytes, usedGb: simulatedBytes / 1024 ** 3, simulated: true };
}

export function applyAiCreditSimulation(limits, request) {
  const profile = getDeveloperProfile(request);
  if (!profile) return limits;
  if (profile.aiCredits === 'unlimited') return { ...limits, monthlyCredits: 1000000, dailyCredits: 100000 };
  const ratio = AI_CREDIT_RATIO[profile.aiCredits] || 1;
  return {
    ...limits,
    monthlyCredits: Math.max(1, Math.ceil((limits.monthlyCredits || 1) * ratio)),
    dailyCredits: Math.max(1, Math.ceil((limits.dailyCredits || 1) * ratio)),
  };
}

export function entitlementForUser(user, request) {
  const profile = getDeveloperProfile(request);
  const realPlan = realPlanId(user);
  const realIsSuper = hasRealSuperAccess(user);
  const planId = getEffectivePlan(user, request);
  const plan = ENTITLEMENT_PLANS[planId] || ENTITLEMENT_PLANS.free;
  const overrideActive = realIsSuper && !!profile;
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
    developerProfile: overrideActive ? profile : null,
    label: plan.name,
    badge: overrideActive ? `Testing as ${plan.name}` : (realIsSuper ? 'Super User · Family Access' : plan.name),
    allowedPlans: realIsSuper ? DEV_PLAN_IDS : [],
  };
}

export function createDevProfileCookie(profile) {
  return `${DEV_PROFILE_COOKIE}=${encodeURIComponent(encodeDeveloperProfile(profile))}; Path=/; Max-Age=604800; SameSite=Lax; HttpOnly${cookieSecureSuffix()}`;
}

export function createDevOverrideCookie(plan) {
  return createDevProfileCookie(profileFromPlan(plan));
}

export function clearDevProfileCookie() {
  return `${DEV_PROFILE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly${cookieSecureSuffix()}`;
}

export function clearDevOverrideCookie() {
  return `${DEV_EFFECTIVE_PLAN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly${cookieSecureSuffix()}`;
}

export function clearAllDevCookiesHeader() {
  return [clearDevProfileCookie(), clearDevOverrideCookie()].join(', ');
}
