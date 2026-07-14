import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { isSuperUser } from '@/lib/entitlements';
import { getAiProfitGuardSnapshot } from '@/lib/ai-profit-guard';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function startOfDay() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function startOfMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (!isSuperUser(user)) return json({ error: 'Admin access required' }, 403);

    const db = await getDb();
    const today = startOfDay();
    const month = startOfMonth();

    const [
      users,
      paidUsers,
      activeMedia,
      trashedMedia,
      storage,
      uploadsToday,
      aiToday,
      aiMonth,
      aiFailures,
      citationFailures,
      feedbackIncorrect,
      storyDrafts,
      pendingInvites,
      webhookFailures,
      profitGuard,
    ] = await Promise.all([
      db.collection('users').countDocuments({ deleted: { $ne: true } }),
      db.collection('users').countDocuments({ plan: { $in: ['plus', 'pro', 'family', 'super_user'] }, deleted: { $ne: true } }),
      db.collection('media').countDocuments({ trashed: { $ne: true } }),
      db.collection('media').countDocuments({ trashed: true }),
      db.collection('media').aggregate([
        { $match: { trashed: { $ne: true } } },
        { $group: { _id: null, bytes: { $sum: '$size' } } },
      ]).toArray(),
      db.collection('media').countDocuments({ createdAt: { $gte: today } }),
      db.collection('ai_usage').aggregate([
        { $match: { createdAt: { $gte: today }, status: 'success' } },
        { $group: { _id: null, requests: { $sum: 1 }, cost: { $sum: '$estimatedCost' }, credits: { $sum: '$credits' } } },
      ]).toArray(),
      db.collection('ai_usage').aggregate([
        { $match: { createdAt: { $gte: month }, status: 'success' } },
        { $group: { _id: null, requests: { $sum: 1 }, cost: { $sum: '$estimatedCost' }, credits: { $sum: '$credits' } } },
      ]).toArray(),
      db.collection('ai_usage').countDocuments({ createdAt: { $gte: today }, status: 'failed' }),
      db.collection('lifegpt_audits').countDocuments({ createdAt: { $gte: month }, citationValid: false }),
      db.collection('lifegpt_feedback').countDocuments({ createdAt: { $gte: month }, rating: 'incorrect' }),
      db.collection('memory_stories').countDocuments({ deleted: { $ne: true } }),
      db.collection('family_invitations').countDocuments({ status: 'pending', expiresAt: { $gt: new Date() } }),
      db.collection('webhook_events').countDocuments({ createdAt: { $gte: today }, status: { $in: ['failed', 'error'] } }),
      getAiProfitGuardSnapshot({ db }).catch(() => null),
    ]);

    const aiDaily = aiToday[0] || {};
    const aiMonthly = aiMonth[0] || {};
    return json({
      generatedAt: new Date(),
      users: { total: users, paid: paidUsers, conversionPercent: users ? Number(((paidUsers / users) * 100).toFixed(2)) : 0 },
      vault: { activeMedia, trashedMedia, storageBytes: Number(storage[0]?.bytes || 0), uploadsToday },
      ai: {
        today: { requests: aiDaily.requests || 0, credits: aiDaily.credits || 0, estimatedCostUsd: Number((aiDaily.cost || 0).toFixed(6)), failures: aiFailures },
        month: { requests: aiMonthly.requests || 0, credits: aiMonthly.credits || 0, estimatedCostUsd: Number((aiMonthly.cost || 0).toFixed(6)) },
        citationFailures,
        incorrectFeedback: feedbackIncorrect,
        profitGuard,
        controls: {
          globalPaused: ['1', 'true', 'yes', 'on'].includes(String(process.env.AI_GLOBAL_KILL_SWITCH || '').toLowerCase()),
          openaiPaused: ['1', 'true', 'yes', 'on'].includes(String(process.env.AI_DISABLE_OPENAI || '').toLowerCase()),
          geminiPaused: ['1', 'true', 'yes', 'on'].includes(String(process.env.AI_DISABLE_GEMINI || '').toLowerCase()),
          dailyCapUsd: Number(process.env.AI_DAILY_SPEND_CAP_USD || 25),
          monthlyCapUsd: Number(process.env.AI_MONTHLY_SPEND_CAP_USD || 500),
        },
      },
      operations: { storyDrafts, pendingFamilyInvites: pendingInvites, webhookFailuresToday: webhookFailures },
      privacy: 'Operational metrics only. This endpoint does not return prompts, media content, face names, signed URLs or private story text.',
    });
  } catch (error) {
    console.error('[admin-operations] snapshot failed', error?.message);
    return json({ error: 'Operations snapshot is temporarily unavailable.' }, 500);
  }
}
