import { GoogleGenAI, Modality } from '@google/genai';
import { analyzeImage, analyzeVideo, transcribeAudio } from '@/lib/gemini';
import { executeAiGatewayTask } from '@/lib/ai/gateway';
import { AI_MODELS } from '@/lib/ai/models';

const COSTS = Object.freeze({
  imageAnalysis: Math.max(0.0001, Number(process.env.AI_UPLOAD_IMAGE_MAX_COST_USD || 0.005)),
  videoAnalysis: Math.max(0.0001, Number(process.env.AI_UPLOAD_VIDEO_MAX_COST_USD || 0.03)),
  transcription: Math.max(0.0001, Number(process.env.AI_TRANSCRIPTION_MAX_COST_USD || 0.025)),
  tts: Math.max(0.0001, Number(process.env.AI_TTS_MAX_COST_USD || 0.01)),
});

function gatewayError(result) {
  return {
    ok: false,
    blocked: ['external_ai_not_in_plan', 'weekly_ai_wallet_exhausted', 'profit_guard_blocked'].includes(result?.error?.code),
    error: result?.error || { code: 'ai_provider_failed', message: 'AI could not complete this task.' },
    gate: {
      wallet: result?.error?.weeklyWallet || null,
      profitGuard: result?.error?.profitGuard || null,
    },
  };
}

async function transcribeWithGroq({ buffer, mimeType }) {
  if (!process.env.GROQ_API_KEY) return null;
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType || 'audio/mpeg' }), 'snapnext-audio');
  form.append('model', AI_MODELS.groq.transcription.id);
  form.append('response_format', 'verbose_json');
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  if (!response.ok) {
    const error = new Error(`Groq transcription returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const durationSeconds = Math.max(0, Number(data.duration || data.x_groq?.usage?.total_time) || 0);
  const actualCostUsd = durationSeconds > 0
    ? Number(((durationSeconds / 3600) * AI_MODELS.groq.transcription.perHourUsd).toFixed(8))
    : null;
  return {
    result: String(data.text || '').trim(),
    provider: 'groq',
    model: AI_MODELS.groq.transcription.id,
    actualCostUsd,
    costBasis: actualCostUsd == null ? 'ceiling_fallback' : 'duration_calculated',
    providerUsage: { durationSeconds },
  };
}

export async function analyzeMediaWithBudget({ db, user, request = null, buffer, name = '', mimeType = '', kind = 'photo', source = 'upload' }) {
  const isVideo = kind === 'video';
  const taskId = isVideo ? 'upload_video_analysis' : 'upload_image_analysis';
  const maximumCostUsd = isVideo ? COSTS.videoAnalysis : COSTS.imageAnalysis;
  const result = await executeAiGatewayTask({
    db,
    user,
    request,
    taskId,
    media: { mimeType, size: buffer?.length || 0 },
    metadata: { source, bytes: buffer?.length || 0, configuredMaximumCostUsd: maximumCostUsd },
    execute: async () => ({
      result: isVideo
        ? await analyzeVideo({ buffer, name, mimeType })
        : await analyzeImage({ buffer, mimeType }),
      provider: 'gemini',
      model: AI_MODELS.gemini.multimodal.id,
      actualCostUsd: null,
      costBasis: 'ceiling_fallback',
      providerUsage: { bytes: buffer?.length || 0 },
    }),
  });
  return result.ok ? { ok: true, result: result.result, gate: result.meta, estimatedCostUsd: result.meta.actualCostUsd } : gatewayError(result);
}

export async function transcribeAudioWithBudget({ db, user, request = null, buffer, mimeType = '' }) {
  const result = await executeAiGatewayTask({
    db,
    user,
    request,
    taskId: 'audio_transcription',
    media: { mimeType, size: buffer?.length || 0 },
    metadata: { source: 'audio-transcribe', bytes: buffer?.length || 0, configuredMaximumCostUsd: COSTS.transcription },
    execute: async () => {
      const groq = await transcribeWithGroq({ buffer, mimeType });
      if (groq?.result) return groq;
      return {
        result: await transcribeAudio({ buffer, mimeType }),
        provider: 'gemini',
        model: AI_MODELS.gemini.multimodal.id,
        actualCostUsd: null,
        costBasis: 'ceiling_fallback',
        providerUsage: { bytes: buffer?.length || 0 },
      };
    },
    validateResult: (text) => String(text || '').trim()
      ? { ok: true }
      : { ok: false, status: 502, error: { code: 'transcription_failed', message: 'The transcription came back empty. Please try again.' } },
  });
  return result.ok ? { ok: true, result: result.result, gate: result.meta, estimatedCostUsd: result.meta.actualCostUsd } : gatewayError(result);
}

export async function textToSpeechWithBudget({ db, user, request = null, text }) {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('Voice AI is not configured.');
    error.code = 'ai_service_unavailable';
    throw error;
  }
  const result = await executeAiGatewayTask({
    db,
    user,
    request,
    taskId: 'voice_tts',
    prompt: String(text || '').slice(0, 300),
    metadata: { source: 'chat-voice', characters: String(text || '').length, configuredMaximumCostUsd: COSTS.tts },
    execute: async () => {
      const voiceAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await voiceAi.models.generateContent({
        model: AI_MODELS.gemini.tts.id,
        contents: [{ parts: [{ text: String(text || '').slice(0, 300) }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      return {
        result: response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null,
        provider: 'gemini',
        model: AI_MODELS.gemini.tts.id,
        actualCostUsd: null,
        costBasis: 'ceiling_fallback',
        providerUsage: { characters: String(text || '').length },
      };
    },
    validateResult: (audio) => audio
      ? { ok: true }
      : { ok: false, status: 502, error: { code: 'tts_failed', message: 'Voice generation returned no audio.' } },
  });
  if (!result.ok) {
    const error = new Error(result.error?.message || 'Voice AI failed.');
    error.code = result.error?.code || 'tts_failed';
    throw error;
  }
  return { ok: true, result: result.result, gate: result.meta, estimatedCostUsd: result.meta.actualCostUsd };
}
