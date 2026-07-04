import OpenAI from 'openai';
import { GoogleGenAI, Type } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { getEffectivePlan, applyAiCreditSimulation, isFeatureEnabled, isSuperUser } from '@/lib/entitlements';

const PROVIDERS = {
  gemini: 'gemini',
  openai: 'openai',
};

export const AI_FEATURES = {
  caption: { credits: 1, category: 'creative', minTier: 'free', provider: 'creative' },
  hashtags: { credits: 1, category: 'creative', minTier: 'free', provider: 'creative' },
  emojis: { credits: 1, category: 'creative', minTier: 'free', provider: 'creative' },
  postIdeas: { credits: 2, category: 'creative', minTier: 'plus', provider: 'reasoning' },
  doAll: { credits: 4, category: 'creative', minTier: 'plus', provider: 'creative' },
  story: { credits: 3, category: 'reasoning', minTier: 'plus', provider: 'reasoning' },
  memorySummary: { credits: 3, category: 'reasoning', minTier: 'plus', provider: 'reasoning' },
  chat: { credits: 1, category: 'reasoning', minTier: 'free', provider: 'reasoning' },
  vision: { credits: 2, category: 'vision', minTier: 'pro', provider: 'vision' },
  videoScript: { credits: 5, category: 'reasoning', minTier: 'pro', provider: 'reasoning' },
  audioTranscribe: { credits: 2, category: 'vision', minTier: 'plus', provider: 'vision' },
};

export const AI_PLAN_LIMITS = {
  free: { monthlyCredits: 50, dailyCredits: 10, ratePerMinute: 8, enabled: ['caption', 'hashtags', 'emojis', 'chat'] },
  plus: { monthlyCredits: 300, dailyCredits: 60, ratePerMinute: 20, enabled: ['caption', 'hashtags', 'emojis', 'postIdeas', 'doAll', 'story', 'memorySummary', 'chat', 'audioTranscribe'] },
  pro: { monthlyCredits: 1000, dailyCredits: 200, ratePerMinute: 45, enabled: Object.keys(AI_FEATURES) },
  family: { monthlyCredits: 2000, dailyCredits: 350, ratePerMinute: 60, enabled: Object.keys(AI_FEATURES) },
  super_user: { monthlyCredits: 1000000, dailyCredits: 100000, ratePerMinute: 1000, enabled: Object.keys(AI_FEATURES) },
};

const ESTIMATED_COST = {
  gemini: 0.00008,
  openai: 0.00045,
};

const FEATURE_FLAG_MAP = {
  caption: 'aiMemory',
  hashtags: 'aiMemory',
  emojis: 'aiMemory',
  postIdeas: 'aiStudio',
  doAll: 'aiStudio',
  story: 'aiMemory',
  memorySummary: 'aiMemory',
  chat: 'aiStudio',
  vision: 'aiStudio',
  videoScript: 'aiVideo',
  audioTranscribe: 'aiMemory',
};

let openaiClient = null;
let geminiClient = null;

// Development workspaces can route through an OpenAI-compatible gateway
// (e.g. the Emergent Universal LLM gateway) by setting OPENAI_BASE_URL.
// Production leaves OPENAI_BASE_URL unset and uses api.openai.com directly.
function gatewayBaseUrl() {
  return process.env.OPENAI_BASE_URL || '';
}

function hasGatewayGemini() {
  // The OpenAI-compatible gateway can also serve Gemini models
  // (model name convention: "gemini/<model>"). Only relevant when a
  // custom base URL is configured; production Gemini uses GEMINI_API_KEY.
  return Boolean(gatewayBaseUrl() && process.env.OPENAI_API_KEY);
}

function getProviderConfig() {
  return {
    primary: normalizeProvider(process.env.AI_PROVIDER_PRIMARY || 'openai'),
    vision: normalizeProvider(process.env.AI_PROVIDER_VISION || 'gemini'),
    fallback: normalizeProvider(process.env.AI_PROVIDER_FALLBACK || 'gemini'),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasGemini: Boolean(process.env.GEMINI_API_KEY) || hasGatewayGemini(),
  };
}

function normalizeProvider(provider) {
  const p = String(provider || '').toLowerCase();
  return p === PROVIDERS.gemini ? PROVIDERS.gemini : PROVIDERS.openai;
}

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(gatewayBaseUrl() ? { baseURL: gatewayBaseUrl() } : {}),
    });
  }
  return openaiClient;
}

function getGemini() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!geminiClient) geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return geminiClient;
}

function planKey(user, request) {
  return getEffectivePlan(user, request);
}

function structuredError(code, message, status = 400, extra = {}) {
  return { ok: false, status, error: { code, message, ...extra } };
}

function safePrompt(prompt, max = 6000) {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  if (!text) return structuredError('invalid_prompt', 'Prompt is required.', 400);
  if (text.length > max) return structuredError('invalid_prompt', `Prompt is too long. Maximum ${max} characters.`, 400);
  return { ok: true, text };
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function aiFeatureCost(feature, multiplier = 1) {
  return (AI_FEATURES[feature]?.credits || 1) * Math.max(1, Number(multiplier) || 1);
}

export function getAiEntitlement(user, feature, multiplier = 1, request) {
  const featureDef = AI_FEATURES[feature];
  if (!featureDef) return structuredError('feature_not_available', 'This AI feature is not available.', 404);
  const flag = FEATURE_FLAG_MAP[feature];
  if (flag && !isFeatureEnabled(flag, request)) {
    return structuredError('feature_disabled', 'This feature is disabled in Developer Test Mode.', 403, { featureFlag: flag });
  }
  const plan = planKey(user, request);
  const limits = applyAiCreditSimulation(AI_PLAN_LIMITS[plan] || AI_PLAN_LIMITS.free, request);
  const credits = aiFeatureCost(feature, multiplier);
  if (!limits.enabled.includes(feature)) {
    return structuredError('feature_not_available', `This feature is available on ${featureDef.minTier === 'pro' ? 'Pro' : 'Plus'} or higher.`, 403, {
      currentPlan: plan,
      requiredPlan: featureDef.minTier,
      creditsRequired: credits,
    });
  }
  return { ok: true, plan, limits, feature: featureDef, credits };
}

export async function preflightAiRequest({ db, user, feature, prompt, media, multiplier = 1, request }) {
  if (!user) return structuredError('unauthenticated', 'Please sign in to use SnapNext AI.', 401);
  const entitlement = getAiEntitlement(user, feature, multiplier, request);
  if (!entitlement.ok) return entitlement;

  if (prompt !== undefined) {
    const promptCheck = safePrompt(prompt);
    if (!promptCheck.ok) return promptCheck;
  }

  if (media) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (media.mimeType && !allowed.includes(media.mimeType)) {
      return structuredError('unsupported_file_type', 'AI vision accepts JPEG, PNG, and WebP images.', 415);
    }
    if (media.size && media.size > 20 * 1024 * 1024) {
      return structuredError('request_too_large', 'This media is too large for AI processing.', 413);
    }
  }

  const now = new Date();
  const minuteSince = new Date(now.getTime() - 60 * 1000);
  const identifier = user.id;
  const recentRequests = await db.collection('ai_usage').countDocuments({ userId: identifier, createdAt: { $gte: minuteSince } });
  if (recentRequests >= entitlement.limits.ratePerMinute) {
    return structuredError('rate_limited', 'Too many AI requests. Please wait a moment.', 429, { retryAfterSeconds: 60 });
  }

  const daily = await db.collection('ai_usage').aggregate([
    { $match: { userId: identifier, day: dayKey(now) } },
    { $group: { _id: null, credits: { $sum: '$credits' } } },
  ]).toArray();
  const monthly = await db.collection('ai_usage').aggregate([
    { $match: { userId: identifier, month: monthKey(now) } },
    { $group: { _id: null, credits: { $sum: '$credits' } } },
  ]).toArray();

  const dailyUsed = daily[0]?.credits || 0;
  const monthlyUsed = monthly[0]?.credits || 0;
  if (entitlement.plan !== 'super_user' && dailyUsed + entitlement.credits > entitlement.limits.dailyCredits) {
    return structuredError('ai_quota_exceeded', 'You have reached your AI daily limit.', 429, {
      currentPlan: entitlement.plan,
      reset: 'daily',
      creditsRemaining: Math.max(0, entitlement.limits.dailyCredits - dailyUsed),
      creditsRequired: entitlement.credits,
    });
  }
  if (entitlement.plan !== 'super_user' && monthlyUsed + entitlement.credits > entitlement.limits.monthlyCredits) {
    return structuredError('ai_quota_exceeded', 'You have reached your AI limit for this billing period.', 429, {
      currentPlan: entitlement.plan,
      reset: 'monthly',
      creditsRemaining: Math.max(0, entitlement.limits.monthlyCredits - monthlyUsed),
      creditsRequired: entitlement.credits,
    });
  }

  return {
    ok: true,
    plan: entitlement.plan,
    credits: entitlement.credits,
    creditsRemaining: Math.max(0, entitlement.limits.monthlyCredits - monthlyUsed),
    dailyCreditsRemaining: Math.max(0, entitlement.limits.dailyCredits - dailyUsed),
    requestId: uuidv4(),
    ip: request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
  };
}

async function recordAiUsage({ db, user, feature, provider, credits, requestId, startedAt, status = 'success', errorCode = null }) {
  const durationMs = Date.now() - startedAt;
  const cost = Number(((ESTIMATED_COST[provider] || 0) * credits).toFixed(6));
  await db.collection('ai_usage').insertOne({
    id: uuidv4(),
    requestId,
    userId: user.id,
    plan: planKey(user),
    feature,
    provider,
    credits,
    estimatedCost: cost,
    durationMs,
    status,
    errorCode,
    day: dayKey(),
    month: monthKey(),
    createdAt: new Date(),
  });
  return { durationMs, estimatedCost: cost };
}

async function saveAiHistory({ db, user, feature, provider, inputLabel, result }) {
  await db.collection('ai_history').insertOne({
    id: uuidv4(),
    userId: user.id,
    feature,
    provider,
    inputLabel: String(inputLabel || '').slice(0, 160),
    result,
    favorite: false,
    deleted: false,
    createdAt: new Date(),
  });
}

function providerFor(feature) {
  const cfg = getProviderConfig();
  const def = AI_FEATURES[feature];
  if (def?.provider === 'vision') return cfg.vision;
  if (def?.provider === 'creative') return cfg.vision === PROVIDERS.gemini ? PROVIDERS.gemini : cfg.primary;
  return cfg.primary;
}

function providerAvailable(provider) {
  const cfg = getProviderConfig();
  return provider === PROVIDERS.openai ? cfg.hasOpenAI : cfg.hasGemini;
}

async function callOpenAI({ prompt, system = 'You are SnapNext AI. Return concise, helpful output.', jsonMode = false }) {
  const client = getOpenAI();
  if (!client) throw Object.assign(new Error('OpenAI is not configured.'), { code: 'ai_service_unavailable', provider: 'openai' });
  const response = await client.responses.create({
    model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
    instructions: system,
    input: prompt,
    ...(jsonMode ? { text: { format: { type: 'json_object' } } } : {}),
  });
  return response.output_text || '';
}

// Gemini calls routed through the OpenAI-compatible gateway (development
// workspaces without a direct GEMINI_API_KEY). Uses the same Gemini model
// family via the gateway's "gemini/<model>" naming convention.
async function callGeminiViaGateway({ prompt, jsonSchema = null, imageBase64 = null, mimeType = 'image/jpeg' }) {
  const client = getOpenAI();
  if (!client) throw Object.assign(new Error('Gemini is not configured.'), { code: 'ai_service_unavailable', provider: 'gemini' });
  const userContent = imageBase64
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ]
    : prompt;
  const messages = [];
  if (jsonSchema) {
    messages.push({
      role: 'system',
      content: `Respond with a single valid JSON object only (no markdown fences) matching this schema description: ${JSON.stringify(jsonSchema)}`,
    });
  }
  messages.push({ role: 'user', content: userContent });
  const response = await client.chat.completions.create({
    model: process.env.GEMINI_GATEWAY_MODEL || 'gemini/gemini-3.5-flash',
    messages,
    ...(jsonSchema ? { response_format: { type: 'json_object' } } : {}),
  });
  return response.choices?.[0]?.message?.content || '';
}

async function callGemini({ prompt, jsonSchema = null, imageBase64 = null, mimeType = 'image/jpeg' }) {
  const client = getGemini();
  if (!client) {
    if (hasGatewayGemini()) {
      return callGeminiViaGateway({ prompt, jsonSchema, imageBase64, mimeType });
    }
    throw Object.assign(new Error('Gemini is not configured.'), { code: 'ai_service_unavailable', provider: 'gemini' });
  }
  const parts = imageBase64
    ? [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }]
    : [{ text: prompt }];
  const response = await client.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ parts }],
    ...(jsonSchema ? { config: { responseMimeType: 'application/json', responseSchema: jsonSchema } } : {}),
  });
  return response.text || '';
}

function parseJsonOrText(text, fallback = {}) {
  try { return JSON.parse(String(text || '').replace(/```json|```/g, '').trim()); } catch { return { ...fallback, text }; }
}

export async function runAiTask({ db, user, feature, prompt = '', input = {}, media = null, request }) {
  const startedAt = Date.now();
  const preflight = await preflightAiRequest({ db, user, feature, prompt: prompt || input?.topic || input?.text || input?.query || 'AI request', media, multiplier: feature === 'doAll' ? 4 : 1, request });
  if (!preflight.ok) return preflight;

  let provider = providerFor(feature);
  let usedProvider = provider;
  let result;
  try {
    result = await executeFeature({ feature, prompt, input, media, provider });
  } catch (primaryError) {
    const fallback = getProviderConfig().fallback;
    if (fallback !== provider && providerAvailable(fallback)) {
      usedProvider = fallback;
      try {
        result = await executeFeature({ feature, prompt, input, media, provider: fallback });
      } catch (fallbackError) {
        await recordAiUsage({ db, user, feature, provider: usedProvider, credits: 0, requestId: preflight.requestId, startedAt, status: 'failed', errorCode: fallbackError.code || 'ai_provider_failed' });
        return structuredError('ai_provider_failed', 'AI provider failed to generate a response.', 502, { provider: usedProvider });
      }
    } else {
      const code = primaryError.code || 'ai_service_unavailable';
      await recordAiUsage({ db, user, feature, provider: usedProvider, credits: 0, requestId: preflight.requestId, startedAt, status: 'failed', errorCode: code });
      return structuredError(code, code === 'ai_service_unavailable' ? 'AI service is not configured yet.' : 'AI provider failed to generate a response.', code === 'ai_service_unavailable' ? 503 : 502, { provider: usedProvider });
    }
  }

  const usage = await recordAiUsage({ db, user, feature, provider: usedProvider, credits: preflight.credits, requestId: preflight.requestId, startedAt, status: 'success' });
  await saveAiHistory({ db, user, feature, provider: usedProvider, inputLabel: prompt || input?.topic || input?.text || feature, result });

  return {
    ok: true,
    result,
    meta: {
      provider: usedProvider,
      plan: preflight.plan,
      creditsUsed: preflight.credits,
      creditsRemaining: Math.max(0, preflight.creditsRemaining - preflight.credits),
      estimatedCost: usage.estimatedCost,
      responseTimeMs: usage.durationMs,
      requestId: preflight.requestId,
    },
  };
}

async function executeFeature({ feature, prompt, input, media, provider }) {
  const topic = input.topic || input.text || prompt || 'A beautiful memory';
  const system = 'You are SnapNext AI, a premium Digital Life Operating System assistant. Never hallucinate memories. Keep output useful and concise.';

  if (feature === 'caption') {
    if (provider === PROVIDERS.gemini) {
      const text = await callGemini({ prompt: `Write one warm social caption for: ${topic}`, imageBase64: media?.imageBase64, mimeType: media?.mimeType });
      return { caption: text.trim() };
    }
    const text = await callOpenAI({ system, prompt: `Write one warm social caption for: ${topic}` });
    return { caption: text.trim() };
  }
  if (feature === 'hashtags') {
    const text = provider === PROVIDERS.gemini
      ? await callGemini({ prompt: `Return 8 relevant hashtags separated by spaces for: ${topic}` })
      : await callOpenAI({ system, prompt: `Return 8 relevant hashtags separated by spaces for: ${topic}` });
    return { hashtags: text.trim() };
  }
  if (feature === 'emojis') {
    const text = provider === PROVIDERS.gemini
      ? await callGemini({ prompt: `Return 6 emojis only for: ${topic}` })
      : await callOpenAI({ system, prompt: `Return 6 emojis only for: ${topic}` });
    return { emojis: text.trim() };
  }
  if (feature === 'postIdeas') {
    const text = await callOpenAI({ system, prompt: `Create 3 short post ideas as JSON array for: ${topic}`, jsonMode: true });
    return { ideas: parseJsonOrText(text, { ideas: [] }) };
  }
  if (feature === 'story') {
    const text = await callOpenAI({ system, prompt: `Create ${input.count || 5} memory story cards as JSON array with title and caption. Theme: ${topic}`, jsonMode: true });
    return { cards: parseJsonOrText(text, []) };
  }
  if (feature === 'memorySummary') {
    const text = await callOpenAI({ system, prompt: `Write a warm 2-3 sentence memory summary. Context: ${topic}` });
    return { summary: text.trim() };
  }
  if (feature === 'chat') {
    const text = await callOpenAI({ system, prompt: topic });
    return { reply: text.trim() };
  }
  if (feature === 'vision') {
    const schema = {
      type: Type.OBJECT,
      properties: {
        objects: { type: Type.ARRAY, items: { type: Type.STRING } },
        scene: { type: Type.STRING },
        mood: { type: Type.STRING },
        lighting: { type: Type.STRING },
        occasion: { type: Type.STRING },
        colorPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
        activities: { type: Type.ARRAY, items: { type: Type.STRING } },
        locationCategory: { type: Type.STRING },
        peopleCount: { type: Type.NUMBER },
        caption: { type: Type.STRING },
        hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
        emojis: { type: Type.ARRAY, items: { type: Type.STRING } },
        description: { type: Type.STRING },
        seoSummary: { type: Type.STRING },
        alternativeCaptions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['objects', 'scene', 'mood', 'lighting', 'occasion', 'colorPalette', 'activities', 'locationCategory', 'peopleCount', 'caption', 'hashtags', 'emojis', 'description', 'seoSummary', 'alternativeCaptions'],
    };
    const text = await callGemini({ prompt: 'Analyze this media. Do not identify faces. Return structured JSON for SnapNext memory indexing.', imageBase64: media?.imageBase64, mimeType: media?.mimeType, jsonSchema: schema });
    return { analysis: parseJsonOrText(text, {}) };
  }
  if (feature === 'videoScript') {
    const text = await callOpenAI({ system, prompt: `Generate short video scripts, shot list, voice-over, scene breakdown, length recommendation, and platform optimization for: ${topic}` });
    return { script: text.trim() };
  }
  if (feature === 'doAll') {
    const [caption, hashtags, emojis] = await Promise.all([
      executeFeature({ feature: 'caption', prompt, input, media, provider }),
      executeFeature({ feature: 'hashtags', prompt, input, media, provider }),
      executeFeature({ feature: 'emojis', prompt, input, media, provider }),
    ]);
    return { ...caption, ...hashtags, ...emojis };
  }
  throw Object.assign(new Error('Unsupported AI feature'), { code: 'feature_not_available' });
}

export async function getAiUsageSummary({ db, user, request }) {
  if (!isSuperUser(user, request)) return structuredError('feature_not_available', 'AI analytics are available to Super User only.', 403);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db.collection('ai_usage').aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: { provider: '$provider', feature: '$feature', status: '$status', plan: '$plan' }, requests: { $sum: 1 }, credits: { $sum: '$credits' }, cost: { $sum: '$estimatedCost' }, avgMs: { $avg: '$durationMs' } } },
    { $sort: { requests: -1 } },
  ]).toArray();
  return { ok: true, rows, providers: getProviderConfig(), limits: AI_PLAN_LIMITS, features: AI_FEATURES };
}
