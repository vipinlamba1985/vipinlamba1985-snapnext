import OpenAI from 'openai';
import { GoogleGenAI, Type } from '@google/genai';
import { randomUUID } from 'crypto';
import { getEffectivePlan, applyAiCreditSimulation, isFeatureEnabled, isSuperUser } from '@/lib/entitlements';
import { AI_FEATURES, AI_PLAN_LIMITS, getAiTask, getTaskFallbackModels, getTaskModel } from '@/lib/ai/registry';
import { AI_MODELS, estimateTokenCostUsd, getAiModel } from '@/lib/ai/models';
import { executeAiGatewayTask } from '@/lib/ai/gateway';

export { AI_FEATURES, AI_PLAN_LIMITS };

const FEATURE_FLAG_MAP = Object.freeze({
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
});

let openaiClient = null;
let geminiClient = null;

function structuredError(code, message, status = 400, extra = {}) {
  return { ok: false, status, error: { code, message, ...extra } };
}

function cleanPrompt(prompt, max = 18_000) {
  const value = typeof prompt === 'string' ? prompt.trim() : '';
  if (!value) return structuredError('invalid_prompt', 'Prompt is required.', 400);
  if (value.length > max) return structuredError('invalid_prompt', `Prompt is too long. Maximum ${max} characters.`, 400);
  return { ok: true, text: value };
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function planKey(user, request) {
  return getEffectivePlan(user, request);
}

export function aiFeatureCost(feature, multiplier = 1) {
  return (AI_FEATURES[feature]?.credits || 1) * Math.max(1, Number(multiplier) || 1);
}

export function getAiEntitlement(user, feature, multiplier = 1, request) {
  const definition = AI_FEATURES[feature];
  if (!definition) return structuredError('feature_not_available', 'This AI feature is not available.', 404);
  const flag = FEATURE_FLAG_MAP[feature];
  if (flag && !isFeatureEnabled(flag, request)) {
    return structuredError('feature_disabled', 'This feature is disabled in Developer Test Mode.', 403, { featureFlag: flag });
  }
  const plan = planKey(user, request);
  const limits = applyAiCreditSimulation(AI_PLAN_LIMITS[plan] || AI_PLAN_LIMITS.free, request);
  const credits = aiFeatureCost(feature, multiplier);
  if (!limits.enabled.includes(feature)) {
    return structuredError('feature_not_available', `This feature is available on ${definition.minTier === 'pro' ? 'Pro' : 'Plus'} or higher.`, 403, {
      currentPlan: plan,
      requiredPlan: definition.minTier,
      creditsRequired: credits,
    });
  }
  return { ok: true, plan, limits, feature: definition, credits };
}

function mediaValidation(feature, media) {
  if (!media) return { ok: true };
  const mimeType = String(media.mimeType || '').toLowerCase();
  const size = Math.max(0, Number(media.size) || 0);
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const audioPrefixes = ['audio/', 'video/'];
  if (feature === 'audioTranscribe') {
    if (mimeType && !audioPrefixes.some((prefix) => mimeType.startsWith(prefix))) {
      return structuredError('unsupported_file_type', 'Audio transcription requires an audio or video file.', 415);
    }
    if (size > 100 * 1024 * 1024) return structuredError('request_too_large', 'This recording is too large for direct transcription.', 413);
    return { ok: true };
  }
  if (mimeType && !imageTypes.includes(mimeType)) {
    return structuredError('unsupported_file_type', 'AI vision accepts JPEG, PNG, WebP, HEIC, and HEIF images.', 415);
  }
  if (size > 25 * 1024 * 1024) return structuredError('request_too_large', 'This media is too large for direct AI processing.', 413);
  return { ok: true };
}

export async function preflightAiRequest({ db, user, feature, prompt, media, multiplier = 1, request }) {
  if (!user) return structuredError('unauthenticated', 'Please sign in to use SnapNext AI.', 401);
  const entitlement = getAiEntitlement(user, feature, multiplier, request);
  if (!entitlement.ok) return entitlement;
  if (prompt !== undefined) {
    const promptCheck = cleanPrompt(prompt);
    if (!promptCheck.ok) return promptCheck;
  }
  const mediaCheck = mediaValidation(feature, media);
  if (!mediaCheck.ok) return mediaCheck;

  const now = new Date();
  const recentRequests = await db.collection('ai_usage').countDocuments({
    userId: user.id,
    createdAt: { $gte: new Date(now.getTime() - 60_000) },
  });
  if (recentRequests >= entitlement.limits.ratePerMinute) {
    return structuredError('rate_limited', 'Too many AI requests. Please wait a moment.', 429, { retryAfterSeconds: 60 });
  }

  const [daily, monthly] = await Promise.all([
    db.collection('ai_usage').aggregate([
      { $match: { userId: user.id, day: dayKey(now), status: 'success' } },
      { $group: { _id: null, credits: { $sum: '$credits' } } },
    ]).toArray(),
    db.collection('ai_usage').aggregate([
      { $match: { userId: user.id, month: monthKey(now), status: 'success' } },
      { $group: { _id: null, credits: { $sum: '$credits' } } },
    ]).toArray(),
  ]);
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
  };
}

function gatewayBaseUrl() {
  return process.env.OPENAI_BASE_URL || '';
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

function providerConfigured(provider) {
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  if (provider === 'gemini') return Boolean(process.env.GEMINI_API_KEY) || Boolean(gatewayBaseUrl() && process.env.OPENAI_API_KEY);
  if (provider === 'groq') return Boolean(process.env.GROQ_API_KEY);
  return false;
}

function usageShape(inputTokens = 0, outputTokens = 0, cachedInputTokens = 0) {
  return {
    inputTokens: Math.max(0, Number(inputTokens) || 0),
    outputTokens: Math.max(0, Number(outputTokens) || 0),
    cachedInputTokens: Math.max(0, Number(cachedInputTokens) || 0),
  };
}

async function callOpenAI({ model, prompt, system, jsonMode = false, media = null }) {
  const client = getOpenAI();
  if (!client) throw Object.assign(new Error('OpenAI is not configured.'), { code: 'ai_service_unavailable' });
  const content = [{ type: 'input_text', text: prompt }];
  if (media?.imageBase64) content.push({ type: 'input_image', image_url: `data:${media.mimeType || 'image/jpeg'};base64,${media.imageBase64}` });
  const response = await client.responses.create({
    model: model.id,
    instructions: system,
    input: [{ role: 'user', content }],
    reasoning: { effort: 'none' },
    ...(jsonMode ? { text: { format: { type: 'json_object' } } } : {}),
  });
  const usage = usageShape(
    response.usage?.input_tokens,
    response.usage?.output_tokens,
    response.usage?.input_tokens_details?.cached_tokens,
  );
  return {
    text: response.output_text || '',
    provider: 'openai',
    model: model.id,
    providerUsage: usage,
    actualCostUsd: estimateTokenCostUsd(model, usage),
  };
}

async function callGeminiViaGateway({ model, prompt, jsonMode = false, media = null }) {
  const client = getOpenAI();
  if (!client) throw Object.assign(new Error('Gemini gateway is not configured.'), { code: 'ai_service_unavailable' });
  const content = media?.imageBase64
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${media.mimeType || 'image/jpeg'};base64,${media.imageBase64}` } },
      ]
    : prompt;
  const response = await client.chat.completions.create({
    model: process.env.GEMINI_GATEWAY_MODEL || `gemini/${model.id}`,
    messages: [{ role: 'user', content }],
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });
  const usage = usageShape(response.usage?.prompt_tokens, response.usage?.completion_tokens, response.usage?.prompt_tokens_details?.cached_tokens);
  return {
    text: response.choices?.[0]?.message?.content || '',
    provider: 'gemini',
    model: model.id,
    providerUsage: usage,
    actualCostUsd: estimateTokenCostUsd(model, usage),
  };
}

async function callGemini({ model, prompt, jsonSchema = null, media = null }) {
  const client = getGemini();
  if (!client) return callGeminiViaGateway({ model, prompt, jsonMode: Boolean(jsonSchema), media });
  const parts = [];
  if (media?.imageBase64 || media?.base64Data) {
    parts.push({ inlineData: { mimeType: media.mimeType || 'image/jpeg', data: media.imageBase64 || media.base64Data } });
  }
  parts.push({ text: prompt });
  const response = await client.models.generateContent({
    model: model.id,
    contents: [{ parts }],
    ...(jsonSchema ? { config: { responseMimeType: 'application/json', responseSchema: jsonSchema } } : {}),
  });
  const usage = usageShape(
    response.usageMetadata?.promptTokenCount,
    response.usageMetadata?.candidatesTokenCount,
    response.usageMetadata?.cachedContentTokenCount,
  );
  return {
    text: response.text || '',
    provider: 'gemini',
    model: model.id,
    providerUsage: usage,
    actualCostUsd: estimateTokenCostUsd(model, usage),
  };
}

async function callGroq({ model, prompt, system, jsonMode = false }) {
  if (!process.env.GROQ_API_KEY) throw Object.assign(new Error('Groq is not configured.'), { code: 'ai_service_unavailable' });
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.id,
      temperature: 0.5,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!response.ok) {
    const error = new Error(`Groq returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const usage = usageShape(data.usage?.prompt_tokens, data.usage?.completion_tokens, 0);
  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: 'groq',
    model: model.id,
    providerUsage: usage,
    actualCostUsd: estimateTokenCostUsd(model, usage),
  };
}

async function callModel({ model, prompt, system, jsonMode = false, jsonSchema = null, media = null }) {
  if (model.provider === 'openai') return callOpenAI({ model, prompt, system, jsonMode, media });
  if (model.provider === 'gemini') return callGemini({ model, prompt, jsonSchema: jsonSchema || (jsonMode ? { type: Type.OBJECT, properties: {} } : null), media });
  if (model.provider === 'groq') return callGroq({ model, prompt, system, jsonMode });
  throw Object.assign(new Error(`Provider ${model.provider} is not supported by the text router.`), { code: 'ai_service_unavailable' });
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(String(text || '').replace(/```json|```/g, '').trim());
  } catch {
    return fallback;
  }
}

function candidatesForTask(feature, media) {
  const task = getAiTask(feature);
  const configured = [getTaskModel(feature), ...getTaskFallbackModels(feature)].filter(Boolean);
  if (media?.imageBase64 && feature === 'caption') {
    return [AI_MODELS.gemini.multimodal, ...configured].filter((model, index, all) => all.findIndex((item) => item.provider === model.provider && item.id === model.id) === index);
  }
  return configured;
}

function outputSchemaForVision() {
  return {
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
}

async function executeFeatureWithModel({ feature, prompt, input, media, model }) {
  const topic = input.topic || input.text || input.query || prompt || 'A beautiful memory';
  const system = 'You are SnapNext AI, a private Digital Life Operating System assistant. Use only supplied facts. Never invent memories, people, relationships, dates, places, or events. Keep output concise and useful.';
  let call;
  let result;
  if (feature === 'caption') {
    call = await callModel({ model, system, prompt: `Write one warm, ready-to-post social caption for: ${topic}`, media });
    result = { caption: call.text.trim() };
  } else if (feature === 'hashtags') {
    call = await callModel({ model, system, prompt: `Return exactly 8 relevant hashtags separated by spaces for: ${topic}` });
    result = { hashtags: call.text.trim() };
  } else if (feature === 'emojis') {
    call = await callModel({ model, system, prompt: `Return exactly 6 relevant emojis only for: ${topic}` });
    result = { emojis: call.text.trim() };
  } else if (feature === 'postIdeas') {
    call = await callModel({ model, system, prompt: `Return JSON with an "ideas" array containing 3 concise social post ideas for: ${topic}`, jsonMode: true });
    result = parseJson(call.text, { ideas: [] });
  } else if (feature === 'story') {
    call = await callModel({ model, system, prompt: `Return JSON with a "cards" array of ${input.count || 5} grounded memory-story cards. Each card needs title and caption. Theme and evidence: ${topic}`, jsonMode: true });
    result = { cards: parseJson(call.text, { cards: [] }).cards || [] };
  } else if (feature === 'memorySummary') {
    call = await callModel({ model, system, prompt: `Write a warm 2-3 sentence memory summary using only this context: ${topic}` });
    result = { summary: call.text.trim() };
  } else if (feature === 'chat') {
    call = await callModel({ model, system, prompt: topic });
    result = { reply: call.text.trim() };
  } else if (feature === 'vision') {
    call = await callModel({
      model: model.provider === 'gemini' ? model : AI_MODELS.gemini.multimodal,
      system,
      prompt: 'Analyze this media for private SnapNext indexing. Do not identify faces. Return the required structured JSON and omit uncertain facts.',
      media,
      jsonSchema: outputSchemaForVision(),
    });
    result = { analysis: parseJson(call.text, {}) };
  } else if (feature === 'videoScript') {
    call = await callModel({ model, system, prompt: `Create a concise short-video script with shot list, voice-over, scene breakdown, duration, and platform recommendation for: ${topic}` });
    result = { script: call.text.trim() };
  } else if (feature === 'doAll') {
    call = await callModel({ model, system, prompt: `Return JSON with "caption", "hashtags", and "emojis" for this ready-to-post package: ${topic}`, jsonMode: true, media });
    const parsed = parseJson(call.text, {});
    result = {
      caption: String(parsed.caption || '').trim(),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.join(' ') : String(parsed.hashtags || '').trim(),
      emojis: Array.isArray(parsed.emojis) ? parsed.emojis.join(' ') : String(parsed.emojis || '').trim(),
    };
  } else {
    throw Object.assign(new Error('Unsupported AI feature.'), { code: 'feature_not_available' });
  }
  return { result, ...call };
}

async function executeWithFallback({ feature, prompt, input, media }) {
  const errors = [];
  for (const model of candidatesForTask(feature, media)) {
    if (!providerConfigured(model.provider)) continue;
    try {
      return await executeFeatureWithModel({ feature, prompt, input, media, model });
    } catch (error) {
      errors.push({ provider: model.provider, model: model.id, code: error?.code || null, message: error?.message || 'failed' });
    }
  }
  const error = new Error('No configured AI provider could complete this task.');
  error.code = errors.length ? 'ai_provider_failed' : 'ai_service_unavailable';
  error.providerErrors = errors.slice(0, 3);
  throw error;
}

async function recordAiUsage({ db, user, feature, plan, provider, model, credits, requestId, durationMs, status, errorCode = null, actualCostUsd = 0, costBasis = null, providerUsage = null }) {
  await db.collection('ai_usage').insertOne({
    id: randomUUID(),
    requestId,
    userId: user.id,
    plan,
    feature,
    provider,
    model,
    credits: status === 'success' ? credits : 0,
    estimatedCost: Math.max(0, Number(actualCostUsd) || 0),
    actualCostUsd: Math.max(0, Number(actualCostUsd) || 0),
    costBasis,
    providerUsage,
    durationMs,
    status,
    errorCode,
    day: dayKey(),
    month: monthKey(),
    createdAt: new Date(),
  });
}

async function saveAiHistory({ db, user, feature, provider, model, inputLabel, result }) {
  await db.collection('ai_history').insertOne({
    id: randomUUID(),
    userId: user.id,
    feature,
    provider,
    model,
    inputLabel: String(inputLabel || '').slice(0, 160),
    result,
    favorite: false,
    deleted: false,
    createdAt: new Date(),
  });
}

export async function runAiTask({ db, user, feature, prompt = '', input = {}, media = null, request }) {
  return executeAiGatewayTask({
    db,
    user,
    request,
    taskId: feature,
    prompt,
    input,
    media,
    metadata: { source: 'ai-router-v2' },
    preflight: () => preflightAiRequest({
      db,
      user,
      feature,
      prompt: prompt || input.topic || input.text || input.query || 'AI request',
      media,
      multiplier: 1,
      request,
    }),
    execute: () => executeWithFallback({ feature, prompt, input, media }),
    validateResult: (result) => {
      if (result == null || (typeof result === 'object' && !Object.keys(result).length)) {
        return structuredError('ai_output_invalid', 'The AI returned an empty result.', 502);
      }
      return { ok: true };
    },
    onSuccess: async ({ requestId, eligibility, execution, durationMs, actualCostUsd }) => {
      await Promise.all([
        recordAiUsage({
          db,
          user,
          feature,
          plan: eligibility.plan,
          provider: execution.provider,
          model: execution.model,
          credits: eligibility.credits,
          requestId,
          durationMs,
          status: 'success',
          actualCostUsd,
          costBasis: execution.costBasis,
          providerUsage: execution.providerUsage,
        }),
        saveAiHistory({
          db,
          user,
          feature,
          provider: execution.provider,
          model: execution.model,
          inputLabel: prompt || input.topic || input.text || input.query || feature,
          result: execution.result,
        }),
      ]);
    },
    onFailure: async ({ requestId, eligibility, execution, error, durationMs }) => {
      await recordAiUsage({
        db,
        user,
        feature,
        plan: eligibility?.plan || planKey(user, request),
        provider: execution?.provider || null,
        model: execution?.model || null,
        credits: 0,
        requestId,
        durationMs,
        status: 'failed',
        errorCode: execution?.error?.code || error?.code || 'ai_provider_failed',
      }).catch(() => null);
    },
  });
}

export async function getAiUsageSummary({ db, user, request }) {
  if (!isSuperUser(user, request)) return structuredError('feature_not_available', 'AI analytics are available to Super User only.', 403);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db.collection('ai_usage').aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: { provider: '$provider', model: '$model', feature: '$feature', status: '$status', plan: '$plan' }, requests: { $sum: 1 }, credits: { $sum: '$credits' }, cost: { $sum: '$actualCostUsd' }, avgMs: { $avg: '$durationMs' } } },
    { $sort: { requests: -1 } },
  ]).toArray();
  return { ok: true, rows, limits: AI_PLAN_LIMITS, features: AI_FEATURES };
}
