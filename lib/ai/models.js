const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function pricedModel({ provider, id, inputPerMillionUsd = 0, cachedInputPerMillionUsd = 0, outputPerMillionUsd = 0 }) {
  return Object.freeze({
    provider,
    id,
    inputPerMillionUsd: finite(inputPerMillionUsd),
    cachedInputPerMillionUsd: finite(cachedInputPerMillionUsd),
    outputPerMillionUsd: finite(outputPerMillionUsd),
  });
}

export const AI_MODELS = Object.freeze({
  openai: Object.freeze({
    economy: pricedModel({
      provider: 'openai',
      id: process.env.OPENAI_TEXT_ECONOMY_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-luna',
      inputPerMillionUsd: process.env.OPENAI_TEXT_ECONOMY_INPUT_USD || 1,
      cachedInputPerMillionUsd: process.env.OPENAI_TEXT_ECONOMY_CACHED_INPUT_USD || 0.1,
      outputPerMillionUsd: process.env.OPENAI_TEXT_ECONOMY_OUTPUT_USD || 6,
    }),
    balanced: pricedModel({
      provider: 'openai',
      id: process.env.OPENAI_TEXT_BALANCED_MODEL || 'gpt-5.6-terra',
      inputPerMillionUsd: process.env.OPENAI_TEXT_BALANCED_INPUT_USD || 2.5,
      cachedInputPerMillionUsd: process.env.OPENAI_TEXT_BALANCED_CACHED_INPUT_USD || 0.25,
      outputPerMillionUsd: process.env.OPENAI_TEXT_BALANCED_OUTPUT_USD || 15,
    }),
    frontier: pricedModel({
      provider: 'openai',
      id: process.env.OPENAI_TEXT_FRONTIER_MODEL || 'gpt-5.6-sol',
      inputPerMillionUsd: process.env.OPENAI_TEXT_FRONTIER_INPUT_USD || 5,
      cachedInputPerMillionUsd: process.env.OPENAI_TEXT_FRONTIER_CACHED_INPUT_USD || 0.5,
      outputPerMillionUsd: process.env.OPENAI_TEXT_FRONTIER_OUTPUT_USD || 30,
    }),
  }),
  gemini: Object.freeze({
    economy: pricedModel({
      provider: 'gemini',
      id: process.env.GEMINI_ECONOMY_MODEL || 'gemini-3.5-flash-lite',
      inputPerMillionUsd: process.env.GEMINI_ECONOMY_INPUT_USD || 0,
      cachedInputPerMillionUsd: process.env.GEMINI_ECONOMY_CACHED_INPUT_USD || 0,
      outputPerMillionUsd: process.env.GEMINI_ECONOMY_OUTPUT_USD || 0,
    }),
    multimodal: pricedModel({
      provider: 'gemini',
      id: process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      inputPerMillionUsd: process.env.GEMINI_VISION_INPUT_USD || 0,
      cachedInputPerMillionUsd: process.env.GEMINI_VISION_CACHED_INPUT_USD || 0,
      outputPerMillionUsd: process.env.GEMINI_VISION_OUTPUT_USD || 0,
    }),
    tts: pricedModel({
      provider: 'gemini',
      id: process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview',
    }),
  }),
  groq: Object.freeze({
    economy: pricedModel({
      provider: 'groq',
      id: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      inputPerMillionUsd: process.env.GROQ_INPUT_USD || 0.05,
      outputPerMillionUsd: process.env.GROQ_OUTPUT_USD || 0.08,
    }),
    transcription: Object.freeze({
      provider: 'groq',
      id: process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo',
      perHourUsd: finite(process.env.GROQ_TRANSCRIPTION_PER_HOUR_USD, 0.04),
    }),
  }),
});

export const RETIRED_AI_MODELS = Object.freeze([
  'gemini-2.0-flash',
  'gpt-4o-mini',
]);

export function getAiModel(provider, role = 'economy') {
  return AI_MODELS[provider]?.[role] || null;
}

export function configuredModelForTask(task) {
  const provider = task?.primary?.provider || 'openai';
  const role = task?.primary?.modelRole || 'economy';
  return getAiModel(provider, role);
}

export function estimateTokenCostUsd(model, usage = {}) {
  if (!model) return null;
  const inputTokens = Math.max(0, finite(usage.inputTokens));
  const cachedInputTokens = Math.min(inputTokens, Math.max(0, finite(usage.cachedInputTokens)));
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const outputTokens = Math.max(0, finite(usage.outputTokens));
  const cost = (
    (uncachedInputTokens / 1_000_000) * finite(model.inputPerMillionUsd)
    + (cachedInputTokens / 1_000_000) * finite(model.cachedInputPerMillionUsd)
    + (outputTokens / 1_000_000) * finite(model.outputPerMillionUsd)
  );
  return cost > 0 ? Number(cost.toFixed(8)) : null;
}

export function validateAiModelConfiguration() {
  const configured = Object.values(AI_MODELS)
    .flatMap((group) => Object.values(group))
    .map((model) => model?.id)
    .filter(Boolean);
  const retired = configured.filter((model) => RETIRED_AI_MODELS.includes(model));
  return {
    ok: retired.length === 0,
    retired,
    configured,
  };
}
