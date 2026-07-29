import OpenAI from 'openai';
import { AI_MODELS, estimateTokenCostUsd } from '@/lib/ai/models';

let client = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('Memory Story Director provider is not configured.');
    error.code = 'ai_service_unavailable';
    throw error;
  }
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
    });
  }
  return client;
}

function usageShape(response) {
  return {
    inputTokens: Math.max(0, Number(response?.usage?.input_tokens) || 0),
    outputTokens: Math.max(0, Number(response?.usage?.output_tokens) || 0),
    cachedInputTokens: Math.max(0, Number(response?.usage?.input_tokens_details?.cached_tokens) || 0),
  };
}

export async function generateMemoryStoryDirectorPackage({ prompt }) {
  const model = AI_MODELS.openai.balanced;
  const response = await getClient().responses.create({
    model: model.id,
    instructions: 'You are SnapNext Memory Story Director. Be emotionally warm, privacy-safe, concise, and strictly grounded in supplied data. Return one valid JSON object only.',
    input: prompt,
    reasoning: { effort: 'none' },
    text: { format: { type: 'json_object' } },
  });

  let result;
  try {
    result = JSON.parse(response.output_text || '{}');
  } catch {
    const error = new Error('Memory Story Director returned invalid JSON.');
    error.code = 'invalid_story_output';
    throw error;
  }

  const providerUsage = usageShape(response);
  return {
    result,
    provider: 'openai',
    model: model.id,
    providerUsage,
    actualCostUsd: estimateTokenCostUsd(model, providerUsage),
    costBasis: 'token_calculated',
  };
}
