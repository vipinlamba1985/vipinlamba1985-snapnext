import { GoogleGenAI } from '@google/genai';

const providers = ['groq', 'gemini', 'openrouter', 'huggingface'];
const keyFor = { gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY', huggingface: 'HUGGINGFACE_API_KEY' };

function configured(provider) {
  const value = process.env[keyFor[provider]]?.trim();
  return Boolean(value && !value.includes('your_'));
}

export function getAiProviderStatus() {
  return providers.map((provider) => ({ provider, configured: configured(provider) }));
}

function orderFor(task, preferredProvider) {
  const base = task === 'vision' ? ['gemini'] : task === 'caption' ? ['groq', 'gemini', 'openrouter', 'huggingface'] : ['groq', 'gemini', 'openrouter', 'huggingface'];
  const preferred = preferredProvider || process.env.AI_DEFAULT_PROVIDER;
  return [...new Set(preferred ? [preferred, ...base] : base)].filter((provider) => providers.includes(provider));
}

async function gemini(input) {
  if (!configured('gemini')) throw new Error('Gemini is not configured');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = input.image ? process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash' : process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const contents = input.image ? { parts: [{ inlineData: { mimeType: input.image.mimeType, data: input.image.base64Data } }, { text: input.prompt }] } : input.prompt;
  const response = await ai.models.generateContent({ model, contents, config: { systemInstruction: input.systemInstruction, responseMimeType: input.json ? 'application/json' : undefined } });
  return response.text || '';
}

async function openAiCompatible(url, apiKey, model, input, headers = {}) {
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ model, temperature: 0.7, response_format: input.json ? { type: 'json_object' } : undefined, messages: [...(input.systemInstruction ? [{ role: 'system', content: input.systemInstruction }] : []), { role: 'user', content: input.prompt }] }) });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function groq(input) {
  if (!configured('groq')) throw new Error('Groq is not configured');
  return openAiCompatible('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, process.env.GROQ_MODEL || 'llama-3.1-8b-instant', input);
}

async function openrouter(input) {
  if (!configured('openrouter')) throw new Error('OpenRouter is not configured');
  return openAiCompatible('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL || 'openrouter/free', input, { 'HTTP-Referer': process.env.PUBLIC_APP_URL || 'https://snapnext.ai', 'X-Title': 'SnapNext AI' });
}

async function huggingface(input) {
  if (!configured('huggingface')) throw new Error('Hugging Face is not configured');
  const model = process.env.HUGGINGFACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';
  const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs: `${input.systemInstruction ? `System: ${input.systemInstruction}\n\n` : ''}User: ${input.prompt}\nAssistant:`, parameters: { max_new_tokens: 900, temperature: 0.7, return_full_text: false } }) });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  const data = await response.json();
  return Array.isArray(data) ? data[0]?.generated_text || '' : data.generated_text || JSON.stringify(data);
}

const callers = { gemini, groq, openrouter, huggingface };

export async function generateAiText(input) {
  const errors = [];
  for (const provider of orderFor(input.task, input.preferredProvider)) {
    try {
      const text = await callers[provider](input);
      if (text.trim()) return { text, provider };
      errors.push(`${provider}: empty response`);
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
    }
  }
  throw new Error(`All AI providers failed or are not configured. ${errors.slice(0, 3).join(' | ')}`);
}
