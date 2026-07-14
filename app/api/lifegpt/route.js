import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { runAiTask } from '@/lib/ai-router';
import { buildLifeIntelligenceContext, contextPromptSummary } from '@/lib/life-intelligence-context';
import { averageMatchConfidence, recordLifeGptAudit, validateLifeGptCitations } from '@/lib/lifegpt-trust';

export const runtime = 'nodejs';

function json(data, status = 200) { return NextResponse.json(data, { status }); }
function normalize(value) { return String(value || '').trim().toLowerCase(); }

function deterministicReply(query, matches, range, context) {
  if (!matches.length) return 'I could not find evidence for that in your saved library yet. Try a different person, place, event, year, or confirm a relationship or event label first.';
  const photos = matches.filter((item) => item.kind === 'photo').length;
  const videos = matches.filter((item) => item.kind === 'video').length;
  const chronological = [...matches].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const first = chronological[0];
  const latest = chronological[chronological.length - 1];
  const q = normalize(query);
  const contextNote = context.relationships.length || context.events.length ? ' I used your confirmed labels to understand the request.' : '';
  if (/\bwhen\b/.test(q) && first?.createdAt) {
    const date = new Date(first.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return `The earliest matching memory I found is from ${date}. I found ${matches.length} grounded source ${matches.length === 1 ? 'item' : 'items'} in total.${contextNote}`;
  }
  if (/\b(latest|recent|newest)\b/.test(q) && latest?.createdAt) {
    const date = new Date(latest.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return `Your latest matching memory is from ${date}. I found ${matches.length} matching ${matches.length === 1 ? 'memory' : 'memories'}.${contextNote}`;
  }
  const period = range ? ` for ${range.label}` : '';
  return `I found ${matches.length} grounded ${matches.length === 1 ? 'memory' : 'memories'}${period}: ${photos} ${photos === 1 ? 'photo' : 'photos'} and ${videos} ${videos === 1 ? 'video' : 'videos'}. Each result includes why it matched and a confidence score.${contextNote}`;
}

function wantsNarrative(query) { return /\b(summarize|summary|story|write|describe|recap|highlights|speech|caption|post)\b/i.test(query || ''); }
function needsCreationClarification(query, resolved) {
  const q = normalize(query).replace(/\bsteel\b/g, 'still');
  const isCreation = /\b(make|create|write|prepare|generate)\b.*\b(post|caption|story|reel)\b|\b(insta|instagram)\b.*\b(post|caption)\b/.test(q);
  const hasScope = /\b(latest|recent|favorite|selected|this|these|family|birthday|wedding|trip|vacation|beach|today|yesterday|last\s+(week|month|year))\b/.test(q)
    || resolved.matchedRelationships.length > 0 || resolved.matchedEvents.length > 0;
  return isCreation && !hasScope;
}
function safeAiUnavailableMessage() { return 'AI writing is temporarily unavailable. Your matching memories are still available below.'; }

export async function POST(request) {
  const startedAt = Date.now();
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const query = String(body.query || '').trim();
    if (!query) return json({ error: 'Query is required' }, 400);
    if (query.length > 1200) return json({ error: 'Please shorten your LifeGPT request to 1,200 characters or less.' }, 400);

    const db = await getDb();
    const intelligence = await buildLifeIntelligenceContext(db, user.id, query, { mediaLimit: 1000, matchLimit: 12 });
    const { items, matches, search: result, resolved, queryContext, graph } = intelligence;
    const baseAudit = {
      userId: user.id, queryLength: query.length, indexedCount: items.length, matchCount: matches.length,
      queryTermCount: result.terms?.length || 0, confirmedRelationshipCount: queryContext.relationships.length,
      confirmedEventCount: queryContext.events.length, averageConfidence: averageMatchConfidence(matches),
      contextEngineVersion: 1, graphCached: graph.cached,
    };

    if (needsCreationClarification(query, resolved)) {
      await recordLifeGptAudit(db, { ...baseAudit, mode: 'clarification', usedAi: false, creditsUsed: 0, citationValid: null, fallbackReason: 'creation_scope_missing', durationMs: Date.now() - startedAt });
      return json({
        reply: 'I can create that. Which memories should I use—your latest photos, favorites, a person, or a confirmed event?',
        matches: [], grounded: true, usedAi: false, creditsUsed: 0, clarificationNeeded: true,
        suggestions: ['Use my latest photos', 'Use my favorites', 'Choose a person', 'Choose an event'],
        queryContext, intelligence: { graph, preferencesApplied: Object.keys(queryContext.preferences || {}) },
        note: 'No AI Credits were used while I asked for the missing details.',
      });
    }

    if (!wantsNarrative(query) || !matches.length) {
      await recordLifeGptAudit(db, { ...baseAudit, mode: 'retrieval', usedAi: false, creditsUsed: 0, citationValid: null, fallbackReason: null, durationMs: Date.now() - startedAt });
      return json({
        reply: deterministicReply(query, matches, result.range, queryContext), matches, grounded: true, usedAi: false, creditsUsed: 0, queryContext,
        memoryBrain: { indexed: items.length, queryTerms: result.terms, explainable: true, averageConfidence: baseAudit.averageConfidence },
        intelligence: { graph, preferencesApplied: Object.keys(queryContext.preferences || {}) },
        note: 'Context assembly, confirmed-label resolution, graph lookup and retrieval consume 0 AI Credits.',
      });
    }

    const evidence = matches.map((item, index) => ({
      source: index + 1, id: item.id, date: item.createdAt, name: item.name, kind: item.kind,
      description: item.description, caption: item.caption, tags: item.tags, people: item.people,
      locations: item.locations, album: item.album, textInside: item.textInside,
      memoryScore: item.qualityScore, matchConfidence: item.confidence, matchReasons: item.reasons,
    }));
    const strictPrompt = [
      'You are LifeGPT, SnapNext\'s private memory assistant.',
      'Answer ONLY from the evidence JSON and confirmed context below.',
      'Never invent people, relationships, places, dates, feelings, events, or facts.',
      'If evidence is insufficient, say so plainly.',
      'Respect saved product preferences only as style defaults; never treat them as facts.',
      'Use concise, warm language and cite evidence inline as [1], [2], etc.',
      `User request: ${query}`,
      `Life Intelligence context: ${JSON.stringify(contextPromptSummary(intelligence)).slice(0, 1600)}`,
      `Evidence JSON: ${JSON.stringify(evidence).slice(0, 4200)}`,
    ].join('\n');

    const aiResult = await runAiTask({
      db, user, feature: 'chat',
      input: { query, groundedMemoryIds: matches.map((item) => item.id), confirmedContext: queryContext, contextEngineVersion: 1 },
      prompt: strictPrompt, request,
    });

    if (!aiResult.ok) {
      await recordLifeGptAudit(db, { ...baseAudit, mode: 'narrative', usedAi: false, creditsUsed: 0, citationValid: null, fallbackReason: aiResult.error?.code || 'provider_unavailable', durationMs: Date.now() - startedAt });
      return json({
        reply: deterministicReply(query, matches, result.range, queryContext), matches, grounded: true, usedAi: false, creditsUsed: 0, aiDeferred: true, queryContext,
        memoryBrain: { indexed: items.length, queryTerms: result.terms, explainable: true, averageConfidence: baseAudit.averageConfidence },
        intelligence: { graph, preferencesApplied: Object.keys(queryContext.preferences || {}) }, note: safeAiUnavailableMessage(),
      });
    }

    const generatedReply = aiResult.result?.reply || aiResult.result?.summary || aiResult.result?.caption || '';
    const citationCheck = validateLifeGptCitations(generatedReply, evidence.length);
    const creditsUsed = aiResult.meta?.creditsUsed ?? aiResult.meta?.credits ?? null;
    if (!citationCheck.valid) {
      await recordLifeGptAudit(db, { ...baseAudit, mode: 'narrative', usedAi: true, creditsUsed, citationValid: false, citationCount: citationCheck.citations.length, invalidCitationCount: citationCheck.invalid.length, fallbackReason: 'citation_validation_failed', provider: aiResult.meta?.provider || null, durationMs: Date.now() - startedAt });
      return json({
        reply: deterministicReply(query, matches, result.range, queryContext), matches, grounded: true, usedAi: true, creditsUsed, citationFallback: true, queryContext,
        memoryBrain: { indexed: items.length, queryTerms: result.terms, explainable: true, averageConfidence: baseAudit.averageConfidence },
        intelligence: { graph, preferencesApplied: Object.keys(queryContext.preferences || {}) },
        note: 'The generated draft did not pass source validation, so only verified memory results are shown.', meta: aiResult.meta || null,
      });
    }

    await recordLifeGptAudit(db, { ...baseAudit, mode: 'narrative', usedAi: true, creditsUsed, citationValid: true, citationCount: citationCheck.citations.length, invalidCitationCount: 0, fallbackReason: null, provider: aiResult.meta?.provider || null, durationMs: Date.now() - startedAt });
    return json({
      reply: generatedReply, matches, grounded: true, usedAi: true, creditsUsed, citationValid: true, queryContext,
      memoryBrain: { indexed: items.length, queryTerms: result.terms, explainable: true, averageConfidence: baseAudit.averageConfidence },
      intelligence: { graph, preferencesApplied: Object.keys(queryContext.preferences || {}) }, meta: aiResult.meta || null,
    });
  } catch (error) {
    console.error('[lifegpt] query failed', error?.message);
    return json({ error: 'LifeGPT could not complete that request right now.' }, 500);
  }
}
