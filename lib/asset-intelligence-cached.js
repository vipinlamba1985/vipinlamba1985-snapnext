import { generateAiText } from '@/lib/ai-provider-router';
import {
  ASSET_INTELLIGENCE_PIPELINE_VERSION,
  ASSET_INTELLIGENCE_SCHEMA_VERSION,
  analyzeAssetIntelligence,
  buildSearchText,
  inferContentType,
} from '@/lib/asset-intelligence';

function cleanText(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanArray(value, max = 20, itemMax = 160) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, itemMax)).filter(Boolean))].slice(0, max);
}

function clamp01(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function providerUnavailable(analysis = {}) {
  const status = cleanText(analysis.providerStatus, 80).toLowerCase();
  return Boolean(status && !['ok', 'success', 'ready'].includes(status));
}

export function hasUsableExistingAnalysis(analysis = {}) {
  if (providerUnavailable(analysis)) return false;
  return Boolean(
    cleanText(analysis.description || analysis.summary || analysis.textInside, 20)
    || (Array.isArray(analysis.tags) && analysis.tags.length)
    || (Array.isArray(analysis.chapters) && analysis.chapters.length),
  );
}

function normalizeDates(value) {
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
    priority: ['low', 'medium', 'high', 'urgent'].includes(item?.priority) ? item.priority : 'medium',
    dueDate: cleanText(item?.dueDate || item?.date, 80) || null,
    confidence: clamp01(item?.confidence, 0.5),
    approvalRequired: true,
  })).filter((item) => item.title);
}

async function reasonFromExisting({ media, analysis, contentType }) {
  const fallback = {
    topics: cleanArray(analysis.tags, 16),
    organizations: [],
    importantDates: [],
    actionCandidates: [],
    taskCandidates: [],
    searchQueries: cleanArray([analysis.description, analysis.summary, analysis.textInside], 8, 220),
    importanceScore: media.favorite || media.isFavorite ? 0.8 : 0.5,
    confidence: 0.7,
    provider: 'deterministic',
  };

  const evidence = {
    fileName: cleanText(media.name, 180),
    kind: media.kind,
    contentType,
    description: cleanText(analysis.description || analysis.summary, 1200),
    visibleText: cleanText(analysis.textInside, 5000),
    tags: cleanArray(analysis.tags, 20),
    locations: cleanArray(analysis.locations, 10),
    objects: cleanArray(analysis.objects, 20),
    activities: cleanArray(analysis.activities, 20),
    chapters: Array.isArray(analysis.chapters) ? analysis.chapters.slice(0, 20) : [],
  };
  if (!evidence.description && !evidence.visibleText && !evidence.tags.length && !evidence.chapters.length) return fallback;

  try {
    const result = await generateAiText({
      task: 'agent',
      json: true,
      systemInstruction: 'Return valid JSON only. Use only supplied evidence and never infer unsupported personal facts.',
      prompt: `Create conservative search intelligence from this verified evidence. Return JSON with topics, organizations, importantDates, actionCandidates, taskCandidates, searchQueries, importanceScore, and confidence. Tasks and actions must be directly supported by the evidence. VERIFIED EVIDENCE: ${JSON.stringify(evidence)}`,
    });
    const parsed = JSON.parse(String(result.text || '').replace(/```json|```/g, '').trim());
    return {
      topics: cleanArray(parsed.topics, 16),
      organizations: cleanArray(parsed.organizations, 12),
      importantDates: normalizeDates(parsed.importantDates),
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

async function fromExistingAnalysis(media) {
  const analysis = media.aiAnalysis || {};
  const contentType = inferContentType(media, analysis);
  const reasoning = await reasonFromExisting({ media, analysis, contentType });
  const now = new Date();
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
    documentType: cleanText(analysis.documentType, 120) || null,
    status: 'ready',
    providerStatus: 'ready',
    perceptionSource: 'existing_media_analysis',
    reasoningProvider: reasoning.provider,
    summary: cleanText(analysis.summary || analysis.description, 1200) || null,
    description: cleanText(analysis.description || analysis.summary, 2200) || null,
    ocrText: cleanText(analysis.textInside, 10000) || null,
    topics: reasoning.topics.length ? reasoning.topics : cleanArray(analysis.tags, 20),
    people: cleanArray(analysis.faces, 20),
    organizations: reasoning.organizations,
    places: cleanArray(analysis.locations, 20),
    objects: cleanArray(analysis.objects, 30),
    activities: cleanArray(analysis.activities, 30),
    emotions: cleanArray(analysis.emotions, 15),
    autoAlbum: cleanText(analysis.autoAlbum, 100) || 'General',
    chapters: Array.isArray(analysis.chapters) ? analysis.chapters.slice(0, 40) : [],
    highlightReel: cleanText(analysis.highlightReel, 600) || null,
    importantDates: reasoning.importantDates,
    actionCandidates: reasoning.actionCandidates,
    taskCandidates: reasoning.taskCandidates,
    searchQueries: reasoning.searchQueries,
    importanceScore: reasoning.importanceScore,
    confidence: reasoning.confidence,
    createdAt: now,
    updatedAt: now,
  };
  record.searchText = buildSearchText(record);
  return record;
}

export async function analyzeAssetIntelligenceCached({ media, buffer = null }) {
  if (hasUsableExistingAnalysis(media?.aiAnalysis)) return fromExistingAnalysis(media);
  return analyzeAssetIntelligence({ media, buffer });
}
