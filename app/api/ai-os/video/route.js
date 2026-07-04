export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { createVideoGenerationPlan, getVideoProviderAvailability, submitVideoGenerationJob } from '@/lib/ai-video-adapters';
import { getEffectivePlan, isFeatureEnabled } from '@/lib/entitlements';
import { canUseAiFeature } from '@/lib/plans';

function videoAccess(user, request) {
  const planId = getEffectivePlan(user, request);
  return { planId, allowed: canUseAiFeature(planId, 'video') };
}

function upgradeRequired(planId) {
  return Response.json({
    error: {
      code: 'upgrade_required',
      message: 'AI Video is available on Pro and Family plans.',
      currentPlan: planId,
      requiredPlan: 'pro',
      upgradePath: '/billing',
    },
  }, { status: 403 });
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to view video AI providers.' } }, { status: 401 });
  }
  if (!isFeatureEnabled('aiVideo', request)) {
    return Response.json({ error: { code: 'feature_disabled', message: 'AI Video is disabled in Developer Test Mode.' } }, { status: 403 });
  }
  const access = videoAccess(user, request);
  if (!access.allowed) return upgradeRequired(access.planId);
  return Response.json({ ok: true, providers: getVideoProviderAvailability(), plan: access.planId });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: { code: 'unauthenticated', message: 'Please sign in to use video AI.' } }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (!isFeatureEnabled('aiVideo', request)) {
    return Response.json({ error: { code: 'feature_disabled', message: 'AI Video is disabled in Developer Test Mode.' } }, { status: 403 });
  }
  const access = videoAccess(user, request);
  if (!access.allowed) return upgradeRequired(access.planId);

  const task = typeof body.task === 'string' ? body.task.trim() : '';
  if (!task) {
    return Response.json({ error: { code: 'invalid_prompt', message: 'Video task prompt is required.' } }, { status: 400 });
  }

  const db = await getDb();
  const action = body.action || 'preview';
  const payload = { db, user, task, input: body.input || {}, qualityMode: body.qualityMode || 'balanced' };
  const result = action === 'submit'
    ? await submitVideoGenerationJob(payload)
    : await createVideoGenerationPlan(payload);

  if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 400 });
  return Response.json(result);
}
