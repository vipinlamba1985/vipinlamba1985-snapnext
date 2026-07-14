const PROVIDERS = ['openai', 'gemini'];

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function providerDisabled(provider) {
  if (!PROVIDERS.includes(provider)) return true;
  return boolEnv(`AI_DISABLE_${provider.toUpperCase()}`, false);
}

function featureDisabled(feature) {
  const key = String(feature || '').replace(/[^a-z0-9]/gi, '_').toUpperCase();
  return key ? boolEnv(`AI_DISABLE_FEATURE_${key}`, false) : false;
}

async function estimatedSpend(db, match) {
  const rows = await db.collection('ai_usage').aggregate([
    { $match: { ...match, status: 'success' } },
    { $group: { _id: null, total: { $sum: '$estimatedCost' } } },
  ]).toArray();
  return Number(rows[0]?.total || 0);
}

export async function checkAiFinancialGuard({ db, feature, provider, estimatedRequestCost = 0 }) {
  if (boolEnv('AI_GLOBAL_KILL_SWITCH', false)) {
    return { ok: false, code: 'ai_temporarily_paused', message: 'SnapNext AI is temporarily paused. Your vault, uploads, downloads and saved memories remain available.' };
  }
  if (featureDisabled(feature)) {
    return { ok: false, code: 'ai_feature_paused', message: 'This AI feature is temporarily paused while core SnapNext services remain available.' };
  }
  if (providerDisabled(provider)) {
    return { ok: false, code: 'ai_provider_paused', message: 'This AI provider is temporarily paused.', provider };
  }

  const now = new Date();
  const dailyCap = numberEnv('AI_DAILY_SPEND_CAP_USD', 25);
  const monthlyCap = numberEnv('AI_MONTHLY_SPEND_CAP_USD', 500);
  const providerMonthlyCap = numberEnv(`AI_${String(provider).toUpperCase()}_MONTHLY_SPEND_CAP_USD`, monthlyCap);

  const [dailySpend, monthlySpend, providerSpend] = await Promise.all([
    estimatedSpend(db, { day: dayKey(now) }),
    estimatedSpend(db, { month: monthKey(now) }),
    estimatedSpend(db, { month: monthKey(now), provider }),
  ]);

  if (dailyCap > 0 && dailySpend + estimatedRequestCost > dailyCap) {
    return { ok: false, code: 'ai_daily_budget_reached', message: 'SnapNext AI has reached today’s safety budget. Core vault services remain fully available.', reset: 'daily' };
  }
  if (monthlyCap > 0 && monthlySpend + estimatedRequestCost > monthlyCap) {
    return { ok: false, code: 'ai_monthly_budget_reached', message: 'SnapNext AI has reached its monthly safety budget. Core vault services remain fully available.', reset: 'monthly' };
  }
  if (providerMonthlyCap > 0 && providerSpend + estimatedRequestCost > providerMonthlyCap) {
    return { ok: false, code: 'ai_provider_budget_reached', message: 'This AI provider has reached its safety budget.', provider, reset: 'monthly' };
  }

  return {
    ok: true,
    budgets: { dailySpend, dailyCap, monthlySpend, monthlyCap, providerSpend, providerMonthlyCap },
  };
}

export function estimatedAiRequestCost(provider, credits) {
  const rates = { gemini: 0.00008, openai: 0.00045 };
  return Number(((rates[provider] || 0) * Math.max(0, Number(credits) || 0)).toFixed(6));
}
