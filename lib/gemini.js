import { GoogleGenAI, Type } from "@google/genai";

let _aiClient = null;

function hasGatewayFallback() {
  return Boolean(process.env.OPENAI_BASE_URL && process.env.OPENAI_API_KEY);
}

async function gatewayVisionJson({ base64Data, mimeType, promptText }) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL });
  const response = await client.chat.completions.create({
    model: process.env.GEMINI_GATEWAY_MODEL || 'gemini/gemini-3.5-flash',
    messages: [
      { role: 'system', content: 'Respond with a single valid JSON object only. No markdown fences.' },
      { role: 'user', content: [{ type: 'text', text: promptText }, { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64Data}` } }] },
    ],
    response_format: { type: 'json_object' },
  });
  const text = response.choices?.[0]?.message?.content || '';
  return JSON.parse(String(text).replace(/```json|```/g, '').trim());
}

function getAiClient() {
  if (!_aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined.");
    _aiClient = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
  }
  return _aiClient;
}

const IMAGE_ANALYSIS_PROMPT = `Analyze this image carefully and return structured JSON.

First classify the image itself into exactly one content type:
- "photo": a camera/photo-style image of people, places, objects, food, scenery, artwork, or a photographed physical scene.
- "screenshot": a direct screen capture of an app, website, chat, social post, map, settings screen, phone/computer UI, or other digital interface. A photograph of a screen is still a photo unless it is clearly a direct screen capture.
- "document": a receipt, invoice, ticket, boarding pass, statement, form, ID/passport page, certificate, letter, note, menu, flyer, poster, or other content whose primary purpose is reading/storing information rather than remembering a photographed scene.

Important classification rules:
- Do not classify a normal photo as a document merely because signs, labels, books, screens, or text appear inside it.
- Do not classify a screenshot as a document merely because it contains lots of text. If it is clearly a direct phone/computer screen capture, use screenshot.
- Use document only when the information-bearing page/card itself is the main subject.
- When uncertain between photo and another type, choose photo and lower confidence.

Return:
1. "contentType": exactly one of ["photo", "screenshot", "document"].
2. "contentTypeConfidence": number from 0 to 1.
3. "contentTypeEvidence": 1-3 short visible reasons supporting the classification.
4. "description": a factual 1-2 sentence description of what is visibly happening.
5. "tags": 5-10 descriptive search tags.
6. "faces": generic people roles only. Never invent personal names.
7. "emotions": only clearly visible emotions.
8. "locations": real identifiable places only; otherwise [].
9. "autoAlbum": exactly one of ["Family", "Travel", "Birthday", "Wedding", "Kids", "Pets", "Food", "Nature", "General"].
10. "textInside": readable text or null.

Accuracy rule: omit uncertain facts rather than guessing.`;

function normalizeImageAnalysis(result) {
  const type = ['photo', 'screenshot', 'document'].includes(result?.contentType) ? result.contentType : 'photo';
  const confidence = Math.max(0, Math.min(1, Number(result?.contentTypeConfidence || 0)));
  return {
    contentType: type,
    contentTypeConfidence: confidence,
    contentTypeEvidence: Array.isArray(result?.contentTypeEvidence) ? result.contentTypeEvidence.slice(0, 3) : [],
    description: result?.description || null,
    tags: result?.tags || [],
    faces: result?.faces || [],
    emotions: result?.emotions || [],
    locations: result?.locations || [],
    autoAlbum: result?.autoAlbum || "General",
    textInside: result?.textInside || null,
  };
}

export async function analyzeImage({ buffer, mimeType }) {
  if (!process.env.GEMINI_API_KEY) {
    if (hasGatewayFallback()) {
      try {
        const result = await gatewayVisionJson({ base64Data: buffer.toString('base64'), mimeType, promptText: IMAGE_ANALYSIS_PROMPT });
        return normalizeImageAnalysis(result);
      } catch (error) {
        console.error("Gateway Image Analysis failed:", error.message);
        return unavailableImageAnalysis();
      }
    }
    return unavailableImageAnalysis();
  }

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [{ inlineData: { mimeType: mimeType || "image/jpeg", data: buffer.toString('base64') } }, { text: IMAGE_ANALYSIS_PROMPT }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            contentType: { type: Type.STRING, enum: ['photo', 'screenshot', 'document'] },
            contentTypeConfidence: { type: Type.NUMBER },
            contentTypeEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
            description: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            faces: { type: Type.ARRAY, items: { type: Type.STRING } },
            emotions: { type: Type.ARRAY, items: { type: Type.STRING } },
            locations: { type: Type.ARRAY, items: { type: Type.STRING } },
            autoAlbum: { type: Type.STRING },
            textInside: { type: Type.STRING, nullable: true },
          },
          required: ["contentType", "contentTypeConfidence", "contentTypeEvidence", "description", "tags", "faces", "emotions", "locations", "autoAlbum", "textInside"],
        },
      },
    });
    return normalizeImageAnalysis(JSON.parse(response.text.trim()));
  } catch (error) {
    console.error("Gemini Image Analysis failed:", error.message);
    return unavailableImageAnalysis();
  }
}

const MAX_INLINE_VIDEO_BYTES = 15 * 1024 * 1024;

export async function analyzeVideo({ buffer, name, mimeType }) {
  if (!process.env.GEMINI_API_KEY) return unavailableVideoAnalysis('ai_service_unavailable');
  if (!buffer || buffer.length === 0) return unavailableVideoAnalysis('video_bytes_unavailable');
  if (buffer.length > MAX_INLINE_VIDEO_BYTES) return unavailableVideoAnalysis('video_too_large_for_analysis');
  try {
    const videoPart = { inlineData: { mimeType: mimeType || 'video/mp4', data: buffer.toString('base64') } };
    const promptPart = { text: `Watch this video and return structured JSON describing ONLY what actually happens in it:
1. "summary": 1-2 factual sentences.
2. "chapters": scene-change chapters with timestamp and title.
3. "highlightReel": one editing suggestion.
4. "tags": 5-8 descriptive tags.
5. "autoAlbum": one of ["Family", "Travel", "Birthday", "Wedding", "Kids", "Pets", "Food", "Nature", "General"].
Never invent people, names, places, or events.` };
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [videoPart, promptPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            chapters: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { timestamp: { type: Type.STRING }, title: { type: Type.STRING } }, required: ["timestamp", "title"] } },
            highlightReel: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            autoAlbum: { type: Type.STRING },
          },
          required: ["summary", "chapters", "highlightReel", "tags", "autoAlbum"],
        },
      },
    });
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Gemini Video Analysis failed:", error.message);
    return unavailableVideoAnalysis('analysis_failed');
  }
}

export async function transcribeAudio({ buffer, mimeType }) {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('Audio transcription is not available yet. The AI service is not configured.');
    err.code = 'ai_service_unavailable';
    throw err;
  }
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ inlineData: { mimeType: mimeType || "audio/mp3", data: buffer.toString('base64') } }, "Transcribe this audio recording clearly. Return only the transcription text."],
    });
    const text = (response.text || '').trim();
    if (!text) throw Object.assign(new Error('The transcription came back empty. Please try again.'), { code: 'transcription_failed' });
    return text;
  } catch (error) {
    if (error.code === 'transcription_failed' || error.code === 'ai_service_unavailable') throw error;
    throw Object.assign(new Error('We could not transcribe this audio right now. Please try again.'), { code: 'transcription_failed' });
  }
}

export async function askMemoryAssistant({ user, query, libraryContext }) {
  if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error('SnapNext AI is not configured yet.'), { code: 'ai_service_unavailable' });
  const systemPrompt = `You are the SnapNext AI Memory Assistant for the user's own library. Only use facts present in this database context. Never invent names, people, places, dates, trips, or counts.\nUser: ${user.name}\nLibrary context: ${JSON.stringify(libraryContext).slice(0, 12000)}\nIf you identify matching media, end with MATCH_DATA JSON containing action and matchedIds.`;
  const ai = getAiClient();
  const response = await ai.models.generateContent({ model: "gemini-3.5-flash", contents: [{ role: "user", parts: [{ text: systemPrompt }, { text: query }] }] });
  return response.text;
}

function unavailableImageAnalysis() {
  return { contentType: 'photo', contentTypeConfidence: 0, contentTypeEvidence: [], description: null, tags: [], faces: [], emotions: [], locations: [], autoAlbum: 'Unprocessed', textInside: null, unavailable: true };
}

function unavailableVideoAnalysis(reason = 'unavailable') {
  return { summary: null, chapters: [], highlightReel: null, tags: [], autoAlbum: 'Unprocessed', unavailable: true, reason };
}
