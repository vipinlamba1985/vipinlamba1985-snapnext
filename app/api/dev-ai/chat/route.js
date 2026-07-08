import { getUserFromRequest } from '@/lib/auth';
import { isSuperUser } from '@/lib/entitlements';
import { getDb } from '@/lib/db';
import { runDevAI } from '@/lib/dev-ai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DAILY_LIMIT = Math.max(1, Number(process.env.DEV_AI_DAILY_REQUEST_LIMIT || 50));

function startOfUtcDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user || !isSuperUser(user, request)) {
    return Response.json({ error: { code: 'forbidden', message: 'SnapNext Dev AI is admin-only.' } }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const message = String(body.message || '').trim();
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];

  if (!message) {
    return Response.json({ error: { code: 'invalid_request', message: 'Enter a coding question or task.' } }, { status: 400 });
  }
  if (message.length > 16000) {
    return Response.json({ error: { code: 'too_large', message: 'The request is too large.' } }, { status: 413 });
  }

  const db = await getDb();
  const collection = db.collection('dev_ai_usage');
  const usedToday = await collection.countDocuments({ userId: user.id, createdAt: { $gte: startOfUtcDay() } });
  if (usedToday >= DAILY_LIMIT) {
    return Response.json({ error: { code: 'daily_limit', message: `Dev AI daily request limit reached (${DAILY_LIMIT}).` } }, { status: 429 });
  }

  const startedAt = Date.now();
  try {
    const result = await runDevAI({ message, history });
    await collection.insertOne({
      userId: user.id,
      model: result.model,
      inputTokens: Number(result.usage?.input_tokens || 0),
      outputTokens: Number(result.usage?.output_tokens || 0),
      totalTokens: Number(result.usage?.total_tokens || 0),
      toolCalls: result.tools?.length || 0,
      success: true,
      durationMs: Date.now() - startedAt,
      createdAt: new Date(),
    }).catch((error) => console.error('[dev-ai] usage log failed', error?.message));
    return Response.json({ ok: true, ...result, limits: { usedToday: usedToday + 1, dailyLimit: DAILY_LIMIT } });
  } catch (error) {
    console.error('[dev-ai] request failed', error?.message);
    await collection.insertOne({
      userId: user.id,
      model: process.env.OPENAI_DEV_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5',
      success: false,
      errorCode: error?.code || 'dev_ai_failed',
      durationMs: Date.now() - startedAt,
      createdAt: new Date(),
    }).catch(() => null);
    return Response.json({ error: { code: 'dev_ai_failed', message: error?.message || 'Dev AI could not complete this request.' } }, { status: 500 });
  }
}
