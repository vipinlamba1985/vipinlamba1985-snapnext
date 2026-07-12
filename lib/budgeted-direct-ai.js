import { GoogleGenAI, Modality } from '@google/genai';
import { analyzeImage, analyzeVideo, transcribeAudio } from '@/lib/gemini';
import { externalAiBlockedError, releaseExternalAiSpend, reserveExternalAiSpend, settleExternalAiSpend } from '@/lib/ai-spend-gate';

const COSTS = Object.freeze({
  imageAnalysis: Math.max(0.0001, Number(process.env.AI_UPLOAD_IMAGE_MAX_COST_USD || 0.005)),
  videoAnalysis: Math.max(0.0001, Number(process.env.AI_UPLOAD_VIDEO_MAX_COST_USD || 0.03)),
  transcription: Math.max(0.0001, Number(process.env.AI_TRANSCRIPTION_MAX_COST_USD || 0.025)),
  tts: Math.max(0.0001, Number(process.env.AI_TTS_MAX_COST_USD || 0.01)),
});

const PROVIDER_TIMEOUT_MS = Math.max(5000, Number(process.env.AI_PROVIDER_TIMEOUT_MS || 20000));
const RETRY_DELAY_MS = Math.max(100, Number(process.env.AI_PROVIDER_RETRY_DELAY_MS || 500));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerTimeoutError() {
  const error = new Error('AI provider timed out.');
  error.code = 'ai_provider_timeout';
  error.retryable = true;
  return error;
}

function withTimeout(operation, timeoutMs = PROVIDER_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(providerTimeoutError()), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function isTransientProviderError(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return status === 429
    || status >= 500
    || code.includes('rate')
    || code.includes('unavailable')
    || message.includes('temporarily unavailable')
    || message.includes('rate limit')
    || message.includes('overloaded');
}

async function executeWithResilience(execute) {
  try {
    return await withTimeout(execute);
  } catch (error) {
    if (error?.code === 'ai_provider_timeout' || !isTransientProviderError(error)) throw error;
    await sleep(RETRY_DELAY_MS);
    return withTimeout(execute);
  }
}

async function runBudgeted({ db, user, request = null, feature, agentId, estimatedCostUsd, provider, model, metadata = {}, execute }) {
  const gate = await reserveExternalAiSpend({
    db,
    user,
    request,
    feature,
    agentId,
    estimatedCostUsd,
    essential: false,
    metadata,
  });

  if (!gate.allowed) {
    const blocked = externalAiBlockedError(gate);
    return { ok: false, blocked: true, error: blocked, gate };
  }

  try {
    const result = await executeWithResilience(execute);
    await settleExternalAiSpend({
      db,
      reservation: gate,
      actualCostUsd: estimatedCostUsd,
      feature,
      agentId,
      userId: user.id,
      provider,
      model,
      metadata,
    });
    return { ok: true, result, gate, estimatedCostUsd };
  } catch (error) {
    await releaseExternalAiSpend({ db, reservation: gate, reason: error?.code || `${feature}_failed` });
    throw error;
  }
}

export async function analyzeMediaWithBudget({ db, user, request = null, buffer, name = '', mimeType = '', kind = 'photo', source = 'upload' }) {
  const isVideo = kind === 'video';
  return runBudgeted({
    db,
    user,
    request,
    feature: isVideo ? 'upload_video_analysis' : 'upload_image_analysis',
    agentId: 'organizer-agent',
    estimatedCostUsd: isVideo ? COSTS.videoAnalysis : COSTS.imageAnalysis,
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    metadata: { source, bytes: buffer?.length || 0 },
    execute: () => isVideo
      ? analyzeVideo({ buffer, name, mimeType })
      : analyzeImage({ buffer, mimeType }),
  });
}

export async function transcribeAudioWithBudget({ db, user, request = null, buffer, mimeType = '' }) {
  return runBudgeted({
    db,
    user,
    request,
    feature: 'audio_transcription',
    agentId: 'memory-agent',
    estimatedCostUsd: COSTS.transcription,
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    metadata: { source: 'audio-transcribe', bytes: buffer?.length || 0 },
    execute: () => transcribeAudio({ buffer, mimeType }),
  });
}

export async function textToSpeechWithBudget({ db, user, request = null, text }) {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('Voice AI is not configured.');
    error.code = 'ai_service_unavailable';
    throw error;
  }

  return runBudgeted({
    db,
    user,
    request,
    feature: 'voice_tts',
    agentId: 'creation-agent',
    estimatedCostUsd: COSTS.tts,
    provider: 'gemini',
    model: 'gemini-3.1-flash-tts-preview',
    metadata: { source: 'chat-voice', characters: String(text || '').length },
    execute: async () => {
      const voiceAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await voiceAi.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: String(text || '').slice(0, 300) }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    },
  });
}
