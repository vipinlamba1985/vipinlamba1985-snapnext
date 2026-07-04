import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini client lazily to prevent boot-time crashes if GEMINI_API_KEY is missing
let _aiClient = null;

// Development workspaces without a direct GEMINI_API_KEY can route Gemini
// analysis through an OpenAI-compatible gateway (OPENAI_BASE_URL +
// OPENAI_API_KEY, e.g. the Emergent Universal LLM gateway). Production with
// GEMINI_API_KEY always uses the direct Google SDK path below.
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
      {
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64Data}` } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
  });
  const text = response.choices?.[0]?.message?.content || '';
  return JSON.parse(String(text).replace(/```json|```/g, '').trim());
}

function getAiClient() {
  if (!_aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined.");
    }
    _aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return _aiClient;
}

/**
 * Automatically analyze every uploaded image using Gemini.
 * Detects faces, people, landmarks, pets, objects, emotions, activities, text.
 * Recommends an auto-album classification.
 */
const IMAGE_ANALYSIS_PROMPT = `Analyze this image in detail and return a structured JSON response containing:
1. "description": A warm, descriptive 1-2 sentence caption about what is visibly happening. Describe only what you can actually see.
2. "tags": An array of 5-10 descriptive search tags (e.g. "sunset", "beach", "dogs", "parks").
3. "faces": An array of generic people roles visible in the image (e.g. "woman", "man", "child", "baby", "group of friends"). NEVER invent personal names. Only use a name if it is visibly written in the image itself.
4. "emotions": An array of emotions visibly conveyed (e.g. "joyful", "serene", "excited"). Only include emotions clearly supported by what is visible.
5. "locations": An array of places or landmarks you can genuinely identify from the image. If you cannot identify a real place, return an empty array. NEVER guess city or country names without clear visual evidence.
6. "autoAlbum": Choose exactly one recommended category out of: ["Family", "Travel", "Birthday", "Wedding", "Kids", "Pets", "Food", "Nature", "General"].
7. "textInside": Any text readable inside the image (or null if none).

Accuracy rules: do not fabricate people, relationships, names, places, or events. When uncertain, omit rather than guess.

Your response must be in valid JSON matching this schema:
{
  "description": string,
  "tags": string[],
  "faces": string[],
  "emotions": string[],
  "locations": string[],
  "autoAlbum": string,
  "textInside": string | null
}`;

function normalizeImageAnalysis(result) {
  return {
    description: result?.description || null,
    tags: result?.tags || [],
    faces: result?.faces || [],
    emotions: result?.emotions || [],
    locations: result?.locations || [],
    autoAlbum: result?.autoAlbum || "General",
    textInside: result?.textInside || null
  };
}

export async function analyzeImage({ buffer, mimeType }) {
  if (!process.env.GEMINI_API_KEY) {
    if (hasGatewayFallback()) {
      try {
        const result = await gatewayVisionJson({
          base64Data: buffer.toString('base64'),
          mimeType,
          promptText: IMAGE_ANALYSIS_PROMPT,
        });
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
    const base64Data = buffer.toString('base64');
    const imagePart = {
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: base64Data
      }
    };

    const promptPart = { text: IMAGE_ANALYSIS_PROMPT };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, promptPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            faces: { type: Type.ARRAY, items: { type: Type.STRING } },
            emotions: { type: Type.ARRAY, items: { type: Type.STRING } },
            locations: { type: Type.ARRAY, items: { type: Type.STRING } },
            autoAlbum: { type: Type.STRING },
            textInside: { type: Type.STRING, nullable: true }
          },
          required: ["description", "tags", "faces", "emotions", "locations", "autoAlbum", "textInside"]
        }
      }
    });

    const result = JSON.parse(response.text.trim());
    return normalizeImageAnalysis(result);

  } catch (error) {
    console.error("Gemini Image Analysis failed:", error.message);
    return unavailableImageAnalysis();
  }
}

/**
 * Analyze an uploaded video using Gemini by sending the actual video bytes.
 * TRUTHFULNESS RULE: we never fabricate video summaries from a filename.
 * If the video cannot genuinely be analyzed (no API key, too large for inline
 * analysis, or provider failure), we return an honest "unavailable" result.
 */
const MAX_INLINE_VIDEO_BYTES = 15 * 1024 * 1024; // Gemini inline data limit safety margin

export async function analyzeVideo({ buffer, name, mimeType }) {
  if (!process.env.GEMINI_API_KEY) {
    return unavailableVideoAnalysis('ai_service_unavailable');
  }
  if (!buffer || buffer.length === 0) {
    return unavailableVideoAnalysis('video_bytes_unavailable');
  }
  if (buffer.length > MAX_INLINE_VIDEO_BYTES) {
    return unavailableVideoAnalysis('video_too_large_for_analysis');
  }

  try {
    const videoPart = {
      inlineData: {
        mimeType: mimeType || 'video/mp4',
        data: buffer.toString('base64'),
      },
    };
    const promptPart = {
      text: `Watch this video and return structured JSON describing ONLY what actually happens in it:
1. "summary": 1-2 sentences describing what visibly happens in the video.
2. "chapters": An array of chapter breakdowns based on actual scene changes, each with "timestamp" (e.g. "0:00") and "title".
3. "highlightReel": A 1-sentence editing suggestion for a short highlight clip based on the real content.
4. "tags": An array of 5-8 descriptive tags based on the real content.
5. "autoAlbum": Choose exactly one: ["Family", "Travel", "Birthday", "Wedding", "Kids", "Pets", "Food", "Nature", "General"].

Accuracy rules: never invent people, names, places, or events. Describe only what is visible or audible.

Respond in valid JSON:
{
  "summary": string,
  "chapters": { timestamp: string, title: string }[],
  "highlightReel": string,
  "tags": string[],
  "autoAlbum": string
}`,
    };

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
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timestamp: { type: Type.STRING },
                  title: { type: Type.STRING }
                },
                required: ["timestamp", "title"]
              }
            },
            highlightReel: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            autoAlbum: { type: Type.STRING }
          },
          required: ["summary", "chapters", "highlightReel", "tags", "autoAlbum"]
        }
      }
    });

    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Gemini Video Analysis failed:", error.message);
    return unavailableVideoAnalysis('analysis_failed');
  }
}

/**
 * Transcribe video audio or voice notes using Gemini.
 * TRUTHFULNESS RULE: we never return a canned fake transcript. If transcription
 * is unavailable or fails, we throw a structured error so callers can return
 * an honest retry/error response.
 */
export async function transcribeAudio({ buffer, mimeType }) {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('Audio transcription is not available yet. The AI service is not configured.');
    err.code = 'ai_service_unavailable';
    throw err;
  }

  try {
    const base64Data = buffer.toString('base64');
    const audioPart = {
      inlineData: {
        mimeType: mimeType || "audio/mp3",
        data: base64Data
      }
    };

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        audioPart,
        "Transcribe this audio recording clearly. Return only the transcription text. Do not include notes or pleasantries."
      ]
    });

    const text = (response.text || '').trim();
    if (!text) {
      const err = new Error('The transcription came back empty. Please try again.');
      err.code = 'transcription_failed';
      throw err;
    }
    return text;
  } catch (error) {
    console.error("Gemini Audio Transcription failed:", error.message);
    if (error.code === 'transcription_failed' || error.code === 'ai_service_unavailable') throw error;
    const err = new Error('We could not transcribe this audio right now. Please try again.');
    err.code = 'transcription_failed';
    throw err;
  }
}

/**
 * Ask Memory Assistant with database context (photos, folders, etc.)
 */
export async function askMemoryAssistant({ user, query, libraryContext }) {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('SnapNext AI is not configured yet.');
    err.code = 'ai_service_unavailable';
    throw err;
  }

  try {
    const systemPrompt = `You are the SnapNext AI Memory Assistant, a helpful AI companion for the user's own photo and video library.

You are speaking to ${user.name}.
Here is the user's current database context of indexed photos and videos:
${JSON.stringify(libraryContext, null, 2)}

Your goals:
1. Help the user search their memories. When the user asks for photos, identify which database IDs match the user's query and output a valid JSON action block.
2. Keep conversations conversational, polished, empathetic, and premium.
3. If they ask to create an album, story, or suggest duplicates, answer warm-heartedly and list what you can do.

Accuracy rules (mandatory):
- Only reference media, tags, people, and places that actually exist in the database context above.
- Never invent names, family members, relationships, trips, locations, dates, or counts.
- If the context does not contain enough information to answer, say so honestly.

If you find photos or videos that match their query, add a JSON structure at the very end of your response:
- "matchedIds": an array of IDs of the database media records that match.
- "action": e.g., "search", "create-album", "play-reel", "none".
- "albumName": string (if creating an album).

Example JSON block at the end of your response:
MATCH_DATA: {"action": "search", "matchedIds": ["media-id-1"], "message": "Here are the matching photos I found."}

Be friendly, accurate, and direct.`;

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: query,
      config: {
        systemInstruction: systemPrompt
      }
    });

    return response.text.trim();
  } catch (error) {
    console.error("Memory Assistant failed:", error.message);
    if (error.code === 'ai_service_unavailable') throw error;
    const err = new Error('I could not process that request right now. Please try again.');
    err.code = 'ai_request_failed';
    throw err;
  }
}

// Honest "unavailable" structures. We return these instead of fabricating
// analysis so downstream features never present invented data as facts.
function unavailableVideoAnalysis(status = 'analysis_unavailable') {
  return {
    providerStatus: status,
    summary: null,
    chapters: [],
    highlightReel: null,
    tags: [],
    autoAlbum: 'Unprocessed',
  };
}

function unavailableImageAnalysis() {
  return {
    providerStatus: 'ai_service_unavailable',
    description: null,
    tags: [],
    faces: [],
    emotions: [],
    locations: [],
    autoAlbum: 'Unprocessed',
    textInside: null,
    objects: [],
    scene: null,
    mood: null,
    lighting: null,
    occasion: null,
    colorPalette: [],
    activities: [],
    locationCategory: null,
    peopleCount: null,
    caption: null,
    hashtags: [],
    emojis: [],
    seoSummary: null,
    alternativeCaptions: [],
  };
}
