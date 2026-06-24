// Emergent Universal LLM client (OpenAI-compatible gateway)
const EMERGENT_KEY = process.env.EMERGENT_LLM_KEY;
const BASE_URL = 'https://integrations.emergentagent.com/llm';

async function chatCompletion({ messages, model = 'gpt-4o-mini', maxTokens = 400, temperature = 0.8 }) {
  if (!EMERGENT_KEY) throw new Error('EMERGENT_LLM_KEY missing');
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${EMERGENT_KEY}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LLM error ${res.status}: ${txt.slice(0,300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

export async function generateCaption({ topic = '', mood = 'casual', platform = 'instagram', imageBase64 = null }) {
  const system = 'You are SnapNext AI, a social media captioning assistant. Reply ONLY with the caption text. No quotes, no preamble. 1-2 sentences. Tone: ' + mood + '. Platform: ' + platform + '.';
  const userText = topic ? `Topic / context: ${topic}` : 'Write a beautiful, sharable caption for this photo.';
  let userMessage;
  if (imageBase64) {
    userMessage = { role: 'user', content: [
      { type: 'text', text: userText },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
    ]};
  } else {
    userMessage = { role: 'user', content: userText };
  }
  return chatCompletion({
    model: imageBase64 ? 'gpt-4o-mini' : 'gpt-4o-mini',
    messages: [ { role: 'system', content: system }, userMessage ],
    maxTokens: 160,
    temperature: 0.85,
  });
}

export async function generateHashtags({ text, count = 8 }) {
  const system = `You generate hashtags. Reply ONLY with ${count} relevant hashtags separated by single spaces. No explanations.`;
  return chatCompletion({ messages: [
    { role: 'system', content: system },
    { role: 'user', content: text || 'A beautiful photo memory.' },
  ], maxTokens: 120, temperature: 0.7 });
}

export async function generateEmojis({ text, count = 6 }) {
  const system = `You suggest emojis. Reply ONLY with ${count} emojis with no spaces or words.`;
  return chatCompletion({ messages: [
    { role: 'system', content: system },
    { role: 'user', content: text || 'Happy memory' },
  ], maxTokens: 40, temperature: 0.7 });
}

export async function generatePostIdeas({ topic }) {
  const system = 'You write 3 short engaging social post ideas as a JSON array of strings. Reply ONLY the JSON array.';
  const out = await chatCompletion({ messages: [
    { role: 'system', content: system },
    { role: 'user', content: topic || 'My recent memories' },
  ], maxTokens: 300 });
  try { return JSON.parse(out); } catch { return [out]; }
}

export async function generateMemorySummary({ titles = [], dateLabel = '' }) {
  const system = 'You are SnapNext AI memory writer. Given a list of photo descriptions or filenames and a date range, write a warm 2-3 sentence narrative summary of these memories. Reply with the narrative only.';
  const user = `Date: ${dateLabel}. Items: ${titles.join(', ') || 'mixed photos'}`;
  return chatCompletion({ messages: [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], maxTokens: 200, temperature: 0.75 });
}

export async function generateStory({ theme, count = 5 }) {
  const system = `You write story cards. Return a JSON array of ${count} objects with keys "title" and "caption" (short, warm). Reply ONLY the JSON.`;
  const out = await chatCompletion({ messages: [
    { role: 'system', content: system },
    { role: 'user', content: theme || 'Family weekend memories' },
  ], maxTokens: 500 });
  try { return JSON.parse(out); } catch { return []; }
}
