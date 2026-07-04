import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini client lazily to prevent boot-time crashes if GEMINI_API_KEY is missing
let _aiClient = null;

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
export async function analyzeImage({ buffer, mimeType }) {
  if (!process.env.GEMINI_API_KEY) {
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

    const promptPart = {
      text: `Analyze this image in detail and return a structured JSON response containing:
1. "description": A warm, descriptive 1-2 sentence caption about what is happening.
2. "tags": An array of 5-10 descriptive search tags (e.g. "sunset", "beach", "dogs", "parks").
3. "faces": An array of detected people or family roles identified using generic labels only (e.g. "woman", "man", "child", "mom", "dad"). Do NOT invent or output any personal names — only generic role labels.
4. "emotions": An array of emotions conveyed (e.g. "joyful", "serene", "excited").
5. "locations": An array of possible places or landmarks detected.
6. "autoAlbum": Choose exactly one recommended category out of: ["Family", "Travel", "Birthday", "Wedding", "Kids", "Pets", "Food", "Nature", "General"].
7. "textInside": Any text readable inside the image (or null if none).

Your response must be in valid JSON matching this schema:
{
  "description": string,
  "tags": string[],
  "faces": string[],
  "emotions": string[],
  "locations": string[],
  "autoAlbum": string,
  "textInside": string | null
}`
    };

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
    return {
      providerStatus: 'ok',
      description: result.description || null,
      tags: result.tags || [],
      faces: result.faces || [],
      emotions: result.emotions || [],
      locations: result.locations || [],
      autoAlbum: result.autoAlbum || "General",
      textInside: result.textInside || null
    };

  } catch (error) {
    console.error("Gemini Image Analysis failed:", error.message);
    return unavailableImageAnalysis();
  }
}

/**
 * Analyze every uploaded video using Gemini.
 * Generates summaries, chapters, classification, and extracts best simulated highlights.
 */
export async function analyzeVideo({ name, mimeType }) {
  if (!process.env.GEMINI_API_KEY) {
    return unavailableVideoAnalysis(name);
  }

  try {
    const prompt = `You are a cinematic AI Video Analysis engine. Given a video with filename "${name}" and MIME type "${mimeType}", generate a highly realistic video indexing metadata package.
    
Return a JSON containing:
1. "summary": A descriptive summary of what this video likely contains.
2. "chapters": An array of chapter breakdowns, each containing "timestamp" (e.g. "0:00", "0:15") and "title" (e.g. "Opening scene", "Blow out the candles").
3. "highlightReel": A 1-sentence prompt suggestion for creating a 30-second TikTok/Reel summary.
4. "tags": An array of 5-8 descriptive tags.
5. "autoAlbum": Choose exactly one: ["Family", "Travel", "Birthday", "Wedding", "Kids", "Pets", "Food", "Nature", "General"].

Your response must be in valid JSON:
{
  "summary": string,
  "chapters": { timestamp: string, title: string }[],
  "highlightReel": string,
  "tags": string[],
  "autoAlbum": string
}`;

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
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

    return { providerStatus: 'ok', ...JSON.parse(response.text.trim()) };
  } catch (error) {
    console.error("Gemini Video Analysis failed:", error.message);
    return unavailableVideoAnalysis(name);
  }
}

/**
 * Transcribe video audio or voice notes using Gemini.
 */
export async function transcribeAudio({ buffer, mimeType }) {
  if (!process.env.GEMINI_API_KEY) {
    return { providerStatus: 'ai_service_unavailable', text: '' };
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

    return { providerStatus: 'ok', text: (response.text || '').trim() };
  } catch (error) {
    console.error("Gemini Audio Transcription failed:", error.message);
    return { providerStatus: 'ai_provider_failed', text: '' };
  }
}

/**
 * Ask Memory Assistant with database context (photos, folders, etc.)
 */
export async function askMemoryAssistant({ user, query, libraryContext }) {
  if (!process.env.GEMINI_API_KEY) {
    return `Hello ${user.name || 'there'}. The AI assistant is not configured on this environment yet.`;
  }

  try {
    const systemPrompt = `You are the SnapNext AI Memory Assistant, an AI life companion that helps the user search and organise the photos, videos, and notes they have themselves uploaded.

You are speaking to ${user.name || 'the user'}.
Here is the user's current database context of indexed photos and videos:
${JSON.stringify(libraryContext, null, 2)}

STRICT RULES:
1. Never invent people, relationships, events, dates, places, or memories that are not present in the provided library context.
2. Never use hardcoded personal names — only refer to people using labels the user's own aiAnalysis records contain.
3. If the answer is unknown, say so honestly instead of inventing content.

Your goals:
1. Help the user search their own memories. When the user asks for photos, identify which database IDs match and output a JSON action block.
2. Keep conversations respectful, concise, and grounded in the library context.
3. If they ask to create an album, story, or suggest duplicates, describe what you can do without fabricating details.

If you find matching media, add a JSON block at the end of your response with:
- "matchedIds": array of matching database media IDs.
- "action": "search" | "create-album" | "play-reel" | "none".
- "albumName": optional string.

Example JSON block at the end of your response:
MATCH_DATA: {"action": "search", "matchedIds": ["media-id-1"], "message": "Found matching photos."}

Be helpful, accurate, and honest.`;

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
    return "The memory assistant is unavailable right now. Please try again in a moment.";
  }
}

// Fallback used when Gemini image analysis is unavailable. Returns an
// empty analysis with a `providerStatus` marker so callers can render
// an honest "not analysed yet" state instead of fabricated metadata.
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


// Video-analysis fallback. Prior versions fabricated cinematic-sounding
// chapters and captions here; that violated SnapNext's zero-fabrication
// rule so this now returns an empty structure with `providerStatus` set.
function unavailableVideoAnalysis(name) {
  return {
    providerStatus: 'ai_service_unavailable',
    summary: null,
    chapters: [],
    highlightReel: null,
    tags: [],
    autoAlbum: 'Unprocessed',
    filename: name || null,
  };
}

// Backwards-compat aliases — internal callers reference these names.
const mockImageAnalysis = unavailableImageAnalysis;
const mockVideoAnalysis = unavailableVideoAnalysis;

