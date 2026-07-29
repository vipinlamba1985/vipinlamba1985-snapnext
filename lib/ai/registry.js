import { PLANS } from '@/lib/plans';
import { configuredModelForTask, getAiModel, validateAiModelConfiguration } from '@/lib/ai/models';

const feature = (credits, category, minTier, provider, extra = {}) => Object.freeze({
  credits,
  category,
  minTier,
  provider,
  ...extra,
});

export const AI_FEATURES = Object.freeze({
  caption: feature(1, 'creative', 'free', 'creative'),
  hashtags: feature(1, 'creative', 'free', 'creative'),
  emojis: feature(1, 'creative', 'free', 'creative'),
  postIdeas: feature(2, 'creative', 'plus', 'reasoning'),
  doAll: feature(4, 'creative', 'plus', 'creative'),
  story: feature(3, 'reasoning', 'plus', 'reasoning'),
  memorySummary: feature(3, 'reasoning', 'plus', 'reasoning'),
  chat: feature(1, 'reasoning', 'free', 'reasoning'),
  vision: feature(2, 'vision', 'pro', 'vision'),
  videoScript: feature(5, 'reasoning', 'pro', 'reasoning'),
  audioTranscribe: feature(2, 'audio', 'plus', 'audio'),
});

const BASIC_FEATURES = Object.freeze(['caption', 'hashtags', 'emojis', 'chat']);
const PLUS_FEATURES = Object.freeze([...BASIC_FEATURES, 'postIdeas', 'doAll', 'story', 'memorySummary', 'audioTranscribe']);
const ALL_FEATURES = Object.freeze(Object.keys(AI_FEATURES));

function planLimit(planId, ratePerMinute, enabled) {
  const plan = PLANS[planId] || PLANS.free;
  return Object.freeze({
    monthlyCredits: plan.aiPerMonth,
    dailyCredits: plan.aiPerDay,
    ratePerMinute,
    enabled: Object.freeze([...enabled]),
  });
}

export const AI_PLAN_LIMITS = Object.freeze({
  free: planLimit('free', 8, BASIC_FEATURES),
  starter: planLimit('starter', 12, BASIC_FEATURES),
  plus: planLimit('plus', 20, PLUS_FEATURES),
  pro: planLimit('pro', 45, ALL_FEATURES),
  family: planLimit('family', 60, ALL_FEATURES),
  super_user: Object.freeze({
    monthlyCredits: 1_000_000,
    dailyCredits: 100_000,
    ratePerMinute: 1_000,
    enabled: ALL_FEATURES,
  }),
});

function maxCost(taskId, fallback) {
  const envKey = `AI_TASK_MAX_COST_${String(taskId).replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_USD`;
  const configured = Number(process.env[envKey]);
  return Math.max(0, Number.isFinite(configured) ? configured : fallback);
}

function task({
  id,
  featureId = id,
  pipeline = 'generation',
  deterministicFirst = false,
  primary,
  fallbacks = [],
  cache = 'none',
  execution = 'sync',
  approvalRequired = false,
  billingPolicy = 'included',
  maxCostUsd = 0.01,
  timeoutMs = 20_000,
  maxAttempts = 2,
  dataClasses = ['user_prompt'],
}) {
  return Object.freeze({
    id,
    featureId,
    pipeline,
    deterministicFirst,
    primary: Object.freeze(primary),
    fallbacks: Object.freeze(fallbacks.map((item) => Object.freeze(item))),
    cache,
    execution,
    approvalRequired,
    billingPolicy,
    maxCostUsd: maxCost(id, maxCostUsd),
    timeoutMs,
    maxAttempts,
    dataClasses: Object.freeze(dataClasses),
  });
}

export const AI_TASK_REGISTRY = Object.freeze({
  caption: task({ id: 'caption', primary: { provider: 'groq', modelRole: 'economy' }, fallbacks: [{ provider: 'openai', modelRole: 'economy' }, { provider: 'gemini', modelRole: 'economy' }], cache: 'user_media_tone_24h', maxCostUsd: 0.002 }),
  hashtags: task({ id: 'hashtags', primary: { provider: 'groq', modelRole: 'economy' }, fallbacks: [{ provider: 'openai', modelRole: 'economy' }], cache: 'user_media_tone_24h', maxCostUsd: 0.001 }),
  emojis: task({ id: 'emojis', primary: { provider: 'groq', modelRole: 'economy' }, fallbacks: [{ provider: 'openai', modelRole: 'economy' }], cache: 'user_media_tone_24h', maxCostUsd: 0.001 }),
  postIdeas: task({ id: 'postIdeas', primary: { provider: 'openai', modelRole: 'economy' }, fallbacks: [{ provider: 'groq', modelRole: 'economy' }], maxCostUsd: 0.005 }),
  doAll: task({ id: 'doAll', primary: { provider: 'openai', modelRole: 'economy' }, fallbacks: [{ provider: 'groq', modelRole: 'economy' }], cache: 'user_media_tone_24h', maxCostUsd: 0.008 }),
  story: task({ id: 'story', deterministicFirst: true, primary: { provider: 'openai', modelRole: 'balanced' }, fallbacks: [{ provider: 'groq', modelRole: 'economy' }], cache: 'user_event_versioned_permanent', execution: 'async_preferred', maxCostUsd: 0.01 }),
  memory_story_director: task({ id: 'memory_story_director', featureId: 'story', pipeline: 'grounded_generation', primary: { provider: 'openai', modelRole: 'balanced' }, cache: 'user_selected_memories_parameters_24h', execution: 'async_preferred', maxCostUsd: 0.03, timeoutMs: 45_000, maxAttempts: 2, dataClasses: ['private_media', 'user_prompt'] }),
  memorySummary: task({ id: 'memorySummary', deterministicFirst: true, primary: { provider: 'groq', modelRole: 'economy' }, fallbacks: [{ provider: 'openai', modelRole: 'economy' }], cache: 'user_event_versioned_permanent', maxCostUsd: 0.004 }),
  chat: task({ id: 'chat', deterministicFirst: true, primary: { provider: 'openai', modelRole: 'economy' }, fallbacks: [{ provider: 'groq', modelRole: 'economy' }, { provider: 'gemini', modelRole: 'economy' }], cache: 'query_24h_when_grounded', maxCostUsd: 0.006 }),
  vision: task({ id: 'vision', pipeline: 'analysis', deterministicFirst: true, primary: { provider: 'gemini', modelRole: 'multimodal' }, cache: 'user_content_pipeline_version_permanent', execution: 'async_preferred', maxCostUsd: 0.02, dataClasses: ['private_media'] }),
  videoScript: task({ id: 'videoScript', primary: { provider: 'openai', modelRole: 'balanced' }, fallbacks: [{ provider: 'groq', modelRole: 'economy' }], maxCostUsd: 0.025 }),
  audioTranscribe: task({ id: 'audioTranscribe', pipeline: 'analysis', primary: { provider: 'groq', modelRole: 'transcription' }, fallbacks: [{ provider: 'gemini', modelRole: 'multimodal' }], cache: 'user_content_pipeline_version_permanent', execution: 'async_preferred', maxCostUsd: 0.025, dataClasses: ['private_audio'] }),
  upload_image_analysis: task({ id: 'upload_image_analysis', featureId: 'vision', pipeline: 'analysis', deterministicFirst: true, primary: { provider: 'gemini', modelRole: 'multimodal' }, cache: 'user_content_pipeline_version_permanent', execution: 'async', maxCostUsd: 0.005, dataClasses: ['private_media'] }),
  upload_video_analysis: task({ id: 'upload_video_analysis', featureId: 'vision', pipeline: 'analysis', deterministicFirst: true, primary: { provider: 'gemini', modelRole: 'multimodal' }, cache: 'user_content_pipeline_version_permanent', execution: 'async', maxCostUsd: 0.03, timeoutMs: 60_000, dataClasses: ['private_media'] }),
  audio_transcription: task({ id: 'audio_transcription', featureId: 'audioTranscribe', pipeline: 'analysis', primary: { provider: 'groq', modelRole: 'transcription' }, fallbacks: [{ provider: 'gemini', modelRole: 'multimodal' }], cache: 'user_content_pipeline_version_permanent', execution: 'async', maxCostUsd: 0.025, timeoutMs: 60_000, dataClasses: ['private_audio'] }),
  voice_tts: task({ id: 'voice_tts', featureId: 'audioTranscribe', primary: { provider: 'gemini', modelRole: 'tts' }, cache: 'user_text_hash_permanent', maxCostUsd: 0.01 }),
  image_create: task({ id: 'image_create', featureId: 'story', pipeline: 'visual_generation', primary: { provider: 'configured_visual', modelRole: 'image' }, execution: 'async', approvalRequired: true, maxCostUsd: 0.08, timeoutMs: 120_000, maxAttempts: 1, dataClasses: ['private_media', 'user_prompt'] }),
  photo_enhance: task({ id: 'photo_enhance', featureId: 'vision', pipeline: 'visual_generation', primary: { provider: 'configured_enhancement', modelRole: 'enhancement' }, execution: 'async', approvalRequired: true, maxCostUsd: 0.05, timeoutMs: 120_000, maxAttempts: 1, dataClasses: ['private_media'] }),
  photo_restore: task({ id: 'photo_restore', featureId: 'vision', pipeline: 'paid_restoration', primary: { provider: 'configured_restoration', modelRole: 'restoration' }, execution: 'async', approvalRequired: true, billingPolicy: 'prepaid', maxCostUsd: 0.08, timeoutMs: 120_000, maxAttempts: 2, dataClasses: ['private_media'] }),
  avatar_motion: task({ id: 'avatar_motion', featureId: 'story', pipeline: 'visual_generation', primary: { provider: 'configured_visual', modelRole: 'avatar_motion' }, execution: 'async', approvalRequired: true, maxCostUsd: 0.2, timeoutMs: 180_000, maxAttempts: 1, dataClasses: ['private_media', 'user_prompt'] }),
  short_video_generation: task({ id: 'short_video_generation', featureId: 'videoScript', pipeline: 'visual_generation', primary: { provider: 'configured_video', modelRole: 'video' }, execution: 'async', approvalRequired: true, maxCostUsd: 0.5, timeoutMs: 300_000, maxAttempts: 1, dataClasses: ['private_media', 'user_prompt'] }),
});

export function getAiTask(taskId) {
  return AI_TASK_REGISTRY[taskId] || null;
}

export function aiTaskCostCeiling(taskId) {
  return getAiTask(taskId)?.maxCostUsd ?? 0;
}

export function getTaskModel(taskId) {
  return configuredModelForTask(getAiTask(taskId));
}

export function getTaskFallbackModels(taskId) {
  return (getAiTask(taskId)?.fallbacks || [])
    .map((candidate) => getAiModel(candidate.provider, candidate.modelRole))
    .filter(Boolean);
}

export function validateAiTaskRegistry() {
  const errors = [];
  for (const [key, value] of Object.entries(AI_TASK_REGISTRY)) {
    if (key !== value.id) errors.push(`${key}: task id mismatch`);
    if (!value.primary?.provider) errors.push(`${key}: primary provider missing`);
    if (!(value.maxCostUsd >= 0)) errors.push(`${key}: invalid maximum cost`);
    if (!['included', 'prepaid'].includes(value.billingPolicy)) errors.push(`${key}: invalid billing policy`);
    if (AI_FEATURES[value.featureId] == null && !['upload_image_analysis', 'upload_video_analysis', 'audio_transcription', 'voice_tts'].includes(key)) {
      errors.push(`${key}: unknown feature ${value.featureId}`);
    }
  }
  const modelValidation = validateAiModelConfiguration();
  if (!modelValidation.ok) errors.push(`retired models configured: ${modelValidation.retired.join(', ')}`);
  return { ok: errors.length === 0, errors, modelValidation };
}
