import { analyzeImage, analyzeVideo } from '@/lib/gemini';
import { generateAiText } from '@/lib/ai-provider-router';

export const ASSET_INTELLIGENCE_PIPELINE_VERSION = 'universal-index-v1';
export const ASSET_INTELLIGENCE_SCHEMA_VERSION = 1;

const CONTENT_TYPES = new Set([
  'photo',
  'video',
  'screenshot',
  'scanned_document',
  'receipt',
  'email',
  'chat',
  'social_post',
  'note',
  'text',
]);

function cleanText(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanArray(value, max = 20, itemMax = 160) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, itemMax)).filter(Boolean))].slice(0, max);
}

function clamp01(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizePriority(value) {
  const priority = cleanText(value, 20).toLowerCase();
  return ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium';
}

function normalizeImportantDates(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((item) => ({
    label: cleanText(item?.label || item?.type || 'date', 80),
    value: cleanText(item?.value || item?.date, 80),
    confidence: clamp01(item?.confidence, 0.5),
  })).filter((item) => item.value);
}

function normalizeActions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((item) => ({
    action: cleanText(item?.action || item?.title || item, 220),
    confidence: clamp01(item?.confidence, 0.5),
    approvalRequired: true,
  })).filter((item) => item.action);
}

function normalizeTasks(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((item) => ({
    title: cleanText(item?.title || item?.task || item, 220),
    priority: normalizePriority(item?.priority),
    dueDate: cleanText(item?.dueDate || item?.date, 80) || null,
    confidence: clamp01(item?.confidence, 0.5),
    approvalRequired: true,
  })).filter((item) => item.title);
}

function providerUnavailable(perception) {
  const status = cleanText(perception?.providerStatus, 80).toLowerCase();
  return Boolean(status && status !== 'ok' && status !== 'success' && status !== 'ready');
}

export function isSupportedAsset(media) {
  return Boolean(media?.id && ['photo', 'video', 'text'].includes(media.kind));
}

export function inferContentType(media, perception = {}) {
  const explicit = cleanText(perception.contentType, 80).toLowerCase();
  if (CONTENT_TYPES.has(explicit)) return explicit;
  if (media?.kind === 'video') return 'video';
  if (media?.kind === 'text') return 'text';

  const text = cleanText(perception.textInside || perception.ocrText, 8000).toLowerCase();
  const name = cleanText(media?.name, 200).toLowerCase();
  const haystack = `${name} ${text}`;

  if (/\b(receipt|subtotal|total due|tax|invoice no|merchant)\b/.test(haystack)) return 'receipt';
  if (/\b(passport|certificate|permit|statement|application form|official document|issued by)\b/.test(haystack)) return 'scanned_document';
  if (/\b(subject:|from:|to:|reply|forwarded message|sent from)\b/.test(haystack)) return 'email';
  if (/\b(whatsapp|messenger|telegram|imessage|chat|typing\.\.\.)\b/.test(haystack)) return 'chat';
  if (/\b(instagram|tiktok|linkedin|reddit|youtube|facebook|tweet|repost|followers)\b/.test(haystack)) return 'social_post';
  if (text.length >= 40) return 'screenshot';
  return 'photo';
}

function defaultSearchQueries({ media, perception, contentType }) {
  const terms = cleanArray([
    media?.name,
    contentType,
    perception?.autoAlbum,
    perception?.description,
    perception?.summary,
    ...(perception?.tags || []),
    ...(perception?.locations || []),
    ...(perception?.objects || []),
    ...(perception?.activities || []),
  ], 18, 120);

  const short = terms.filter((term) => term.length <= 80).slice(0, 8);
  const queries = [];
  if (perception?.description) queries.push(cleanText(perception.description, 180));
  if (short.length) queries.push(short.join(' '));
  if (perception?.textInside) queries.push(cleanText(perception.textInside, 180));
  return cleanArray(queries, 8, 220);
}

function deterministicReasoning({ media, perception, contentType }) {
  return {
    topics: cleanArray(perception?.tags, 12),
    organizations: [],
    importantDates: [],
    actionCandidates: [],
    taskCandidates: [],
    searchQueries: defaultSearchQueries({ media, perception, contentType }),
    importanceScore: media?.favorite || media?.isFavorite ? 0.8 : 0.5,
    confidence: providerUnavailable(perception) ? 0.25 : 0.7,
    provider: 'deterministic',
  };
}

async function reasonAboutPerception({ media, perception, contentType }) {
  const fallback = deterministicReasoning({ media, perception, contentType });
  const evidence = {
    fileName: cleanText(media?.name, 180),
    kind: media?.kind,
    contentType,
    description: cleanText(perception?.description || perception?.summary, 1200),
    visibleText: cleanText(perception?.textInside, 5000),
    tags: cleanArray(perception?.tags, 20),
    locations: cleanArray(perception?.locations, 10),
    objects: cleanArray(perception?.objects, 20),
    activities: cleanArray(perception?.activities, 20),
    chapters: Array.isArray(perception?.chapters) ? perception.chapters.slice(0, 20) : [],
  };

  if (!evidence.description && !evidence.visibleText && !evidence.tags.length && !evidence.chapters.length) return fallback;

  const prompt = `You are the private SnapNext Asset Intelligence reasoning layer. Use ONLY the verified evidence below. Never invent names, relationships, places, dates, deadlines, organizations, or actions. A task or action may be extracted only when the evidence clearly requests, schedules, requires, or suggests something the user could do. Return one JSON object with exactly these fields:\n- topics: string[]\n- organizations: string[]\n- importantDates: {label:string,value:string,confidence:number}[]\n- actionCandidates: {action:string,confidence:number}[]\n- taskCandidates: {title:string,priority:"low"|"medium"|"high"|"urgent",dueDate:string|null,confidence:number}[]\n- searchQueries: string[] (natural phrases a user may later type to find this asset)\n- importanceScore: number from 0 to 1\n- confidence: number from 0 to 1\n\nVERIFIED EVIDENCE:\n${JSON.stringify(evidence)}`;

  try {
    const result = await generateAiText({
      task: 'agent',
      json: true,
      systemInstruction: 'Return valid JSON only. Be conservative. Never infer unsupported personal facts.',
      prompt,
    });
    const parsed = JSON.parse(String(result.text || '').replace(/```json|```/g, '').trim());
    return {
      topics: cleanArray(parsed.topics, 16),
      organizations: cleanArray(parsed.organizations, 12),
      importantDates: normalizeImportantDates(parsed.importantDates),
      actionCandidates: normalizeActions(parsed.actionCandidates),
      taskCandidates: normalizeTasks(parsed.taskCandidates),
      searchQueries: cleanArray(parsed.searchQueries, 12, 220),
      importanceScore: clamp01(parsed.importanceScore, fallback.importanceScore),
      confidence: clamp01(parsed.confidence, fallback.confidence),
      provider: result.provider || 'unknown',
    };
  } catch {
    return fallback;
  }
}

export function buildSearchText(record) {
  return [
    record.name,
    record.contentType,
    record.documentType,
    record.summary,
    record.description,
    record.ocrText,
    record.autoAlbum,
    ...(record.topics || []),
    ...(record.people || []),
    ...(record.organizations || []),
    ...(record.places || []),
    ...(record.objects || []),
    ...(record.activities || []),
    ...(record.searchQueries || []),
    ...(record.actionCandidates || []).map((item) => item.action),
    ...(record.taskCandidates || []).map((item) => item.title),
    ...(record.importantDates || []).flatMap((item) => [item.label, item.value]),
  ].filter(Boolean).join(' ').toLowerCase().slice(0, 20000);
}

export function toLegacyAiAnalysis(record, previous = {}) {
  return {
    ...previous,
    providerStatus: record.status === 'ready' ? 'ready' : record.providerStatus || record.status,
    description: record.description || record.summary || previous.description || null,
    summary: record.summary || previous.summary || null,
    tags: cleanArray([...(record.topics || []), ...(record.objects || [])], 16),
    faces: record.people || [],
    emotions: record.emotions || [],
    locations: record.places || [],
    autoAlbum: record.autoAlbum || previous.autoAlbum || 'General',
    textInside: record.ocrText || null,
    objects: record.objects || [],
    activities: record.activities || [],
    chapters: record.chapters || previous.chapters || [],
    highlightReel: record.highlightReel || previous.highlightReel || null,
    contentType: record.contentType,
    documentType: record.documentType,
    organizations: record.organizations || [],
    importantDates: record.importantDates || [],
    actionCandidates: record.actionCandidates || [],
    taskCandidates: record.taskCandidates || [],
    searchQueries: record.searchQueries || [],
    importanceScore: record.importanceScore,
    confidence: record.confidence,
    intelligenceVersion: record.pipelineVersion,
    intelligenceStatus: record.status,
  };
}

export async function analyzeAssetIntelligence({ media, buffer = null }) {
  if (!isSupportedAsset(media)) throw new Error('Unsupported asset kind for intelligence analysis.');

  let perception = media.aiAnalysis || {};
  if (media.kind === 'photo') {
    if (!buffer) throw new Error('Image bytes are required for analysis.');
    perception = await analyzeImage({ buffer, mimeType: media.mime || 'image/jpeg' });
  } else if (media.kind === 'video') {
    if (!buffer) throw new Error('Video bytes are required for analysis.');
    perception = await analyzeVideo({ buffer, name: media.name, mimeType: media.mime || 'video/mp4' });
  } else if (media.kind === 'text') {
    perception = {
      ...perception,
      description: perception.description || perception.caption || media.name,
      textInside: perception.textInside || perception.caption || perception.description || '',
      tags: perception.tags || [],
      autoAlbum: perception.autoAlbum || 'Personal',
    };
  }

  const contentType = inferContentType(media, perception);
  const reasoning = await reasonAboutPerception({ media, perception, contentType });
  const now = new Date();
  const unavailable = providerUnavailable(perception);

  const record = {
    schemaVersion: ASSET_INTELLIGENCE_SCHEMA_VERSION,
    pipelineVersion: ASSET_INTELLIGENCE_PIPELINE_VERSION,
    userId: media.userId,
    mediaId: media.id,
    sourceHash: media.hash || null,
    name: cleanText(media.name, 240),
    kind: media.kind,
    mime: media.mime || '',
    contentType,
    documentType: cleanText(perception.documentType, 120) || null,
    status: unavailable ? 'partial' : 'ready',
    providerStatus: cleanText(perception.providerStatus, 120) || 'ready',
    perceptionProvider: 'gemini',
    reasoningProvider: reasoning.provider,
    summary: cleanText(perception.summary || perception.description, 1200) || null,
    description: cleanText(perception.description || perception.summary, 2200) || null,
    ocrText: cleanText(perception.textInside, 10000) || null,
    topics: cleanArray(reasoning.topics?.length ? reasoning.topics : perception.tags, 20),
    people: cleanArray(perception.faces, 20),
    organizations: reasoning.organizations,
    places: cleanArray(perception.locations, 20),
    objects: cleanArray(perception.objects, 30),
    activities: cleanArray(perception.activities, 30),
    emotions: cleanArray(perception.emotions, 15),
    autoAlbum: cleanText(perception.autoAlbum, 100) || 'General',
    chapters: Array.isArray(perception.chapters) ? perception.chapters.slice(0, 40) : [],
    highlightReel: cleanText(perception.highlightReel, 600) || null,
    importantDates: reasoning.importantDates,
    actionCandidates: reasoning.actionCandidates,
    taskCandidates: reasoning.taskCandidates,
    searchQueries: reasoning.searchQueries?.length ? reasoning.searchQueries : defaultSearchQueries({ media, perception, contentType }),
    importanceScore: reasoning.importanceScore,
    confidence: reasoning.confidence,
    createdAt: now,
    updatedAt: now,
  };
  record.searchText = buildSearchText(record);
  return record;
}
