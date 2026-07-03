export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/auth';
import {
  DEV_AI_CREDIT_STATES,
  DEV_FEATURE_FLAGS,
  DEV_NOTIFICATION_STATES,
  DEV_PERSONAS,
  DEV_PLAN_IDS,
  DEV_STORAGE_STATES,
  clearDevOverrideCookie,
  clearDevProfileCookie,
  createDevProfileCookie,
  entitlementForUser,
  getDeveloperProfile,
  hasRealSuperAccess,
  normalizeDeveloperProfile,
  profileFromPlan,
  realPlanId,
} from '@/lib/entitlements';

function forbidden() {
  return Response.json({ error: { code: 'forbidden', message: 'Developer Test Mode is available to Admin/Super User accounts only.' } }, { status: 403 });
}

function requestWithProfile(request, profile) {
  return {
    cookies: {
      get: (name) => {
        if (name === 'snapnext_dev_profile') return { value: Buffer.from(JSON.stringify(normalizeDeveloperProfile(profile))).toString('base64url') };
        return request.cookies.get(name);
      },
    },
  };
}

function responseFor(user, request, status = 200, headers = {}) {
  const entitlement = entitlementForUser(user, request);
  const profile = entitlement.developerProfile || getDeveloperProfile(request) || null;
  return Response.json({
    realPlan: realPlanId(user),
    realRole: user?.role || 'user',
    effectivePlan: entitlement.planId,
    effectivePlanName: entitlement.plan.name,
    overrideActive: entitlement.overrideActive,
    overridePlan: profile?.experience || null,
    developerProfile: profile,
    allowedPlans: DEV_PLAN_IDS,
    allowedPersonas: DEV_PERSONAS,
    allowedStorage: DEV_STORAGE_STATES,
    allowedAiCredits: DEV_AI_CREDIT_STATES,
    allowedNotifications: DEV_NOTIFICATION_STATES,
    allowedFeatureFlags: DEV_FEATURE_FLAGS,
    realAccount: hasRealSuperAccess(user) ? 'Admin / Super User' : 'User',
  }, { status, headers });
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in.' } }, { status: 401 });
  if (!hasRealSuperAccess(user)) return forbidden();
  return responseFor(user, request);
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in.' } }, { status: 401 });
  if (!hasRealSuperAccess(user)) return forbidden();

  const body = await request.json().catch(() => ({}));
  const existing = getDeveloperProfile(request) || {};
  const profile = normalizeDeveloperProfile({
    ...existing,
    ...body,
    experience: body?.experience || body?.plan || existing?.experience,
    featureFlags: { ...(existing?.featureFlags || {}), ...(body?.featureFlags || {}) },
  });

  const headers = { 'Set-Cookie': createDevProfileCookie(profile) };
  return responseFor(user, requestWithProfile(request, profile), 200, headers);
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in.' } }, { status: 401 });
  if (!hasRealSuperAccess(user)) return forbidden();

  const headers = new Headers();
  headers.append('Set-Cookie', clearDevProfileCookie());
  headers.append('Set-Cookie', clearDevOverrideCookie());
  return Response.json({
    realPlan: realPlanId(user),
    realRole: user?.role || 'user',
    effectivePlan: realPlanId(user),
    effectivePlanName: realPlanId(user) === 'super_user' ? 'Super User' : realPlanId(user),
    overrideActive: false,
    overridePlan: null,
    developerProfile: profileFromPlan(realPlanId(user)),
    allowedPlans: DEV_PLAN_IDS,
    allowedPersonas: DEV_PERSONAS,
    allowedStorage: DEV_STORAGE_STATES,
    allowedAiCredits: DEV_AI_CREDIT_STATES,
    allowedNotifications: DEV_NOTIFICATION_STATES,
    allowedFeatureFlags: DEV_FEATURE_FLAGS,
    realAccount: 'Admin / Super User',
  }, { headers });
}
