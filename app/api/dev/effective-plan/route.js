export const dynamic = 'force-dynamic';

import { getUserFromRequest } from '@/lib/auth';
import {
  DEV_PLAN_IDS,
  clearDevOverrideCookie,
  createDevOverrideCookie,
  entitlementForUser,
  getDeveloperPlanOverride,
  isSuper,
  normalizePlanId,
  realPlanId,
} from '@/lib/entitlements';

function forbidden() {
  return Response.json({ error: { code: 'forbidden', message: 'Developer Test Mode is available to Admin/Super User accounts only.' } }, { status: 403 });
}

function responseFor(user, request, status = 200, headers = {}) {
  const entitlement = entitlementForUser(user, request);
  const override = getDeveloperPlanOverride(request);
  return Response.json({
    realPlan: realPlanId(user),
    realRole: user?.role || 'user',
    effectivePlan: entitlement.planId,
    effectivePlanName: entitlement.plan.name,
    overrideActive: entitlement.overrideActive,
    overridePlan: override,
    allowedPlans: DEV_PLAN_IDS,
    realAccount: isSuper(user) ? 'Admin / Super User' : 'User',
  }, { status, headers });
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in.' } }, { status: 401 });
  if (!isSuper(user)) return forbidden();
  return responseFor(user, request);
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in.' } }, { status: 401 });
  if (!isSuper(user)) return forbidden();

  const body = await request.json().catch(() => ({}));
  const plan = normalizePlanId(body?.plan);
  if (!plan) {
    return Response.json({ error: { code: 'invalid_plan', message: 'Plan must be one of free, plus, pro, family, or super_user.' } }, { status: 400 });
  }

  const headers = { 'Set-Cookie': createDevOverrideCookie(plan) };
  const requestWithOverride = { cookies: { get: (name) => name === 'snapnext_dev_effective_plan' ? { value: plan } : request.cookies.get(name) } };
  return responseFor(user, requestWithOverride, 200, headers);
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in.' } }, { status: 401 });
  if (!isSuper(user)) return forbidden();

  const headers = { 'Set-Cookie': clearDevOverrideCookie() };
  return Response.json({
    realPlan: realPlanId(user),
    realRole: user?.role || 'user',
    effectivePlan: realPlanId(user),
    effectivePlanName: realPlanId(user) === 'super_user' ? 'Super User' : realPlanId(user),
    overrideActive: false,
    overridePlan: null,
    allowedPlans: DEV_PLAN_IDS,
    realAccount: 'Admin / Super User',
  }, { headers });
}
