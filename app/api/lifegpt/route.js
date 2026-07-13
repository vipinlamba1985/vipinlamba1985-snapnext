import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { runAiTask } from '@/lib/ai-router';
import { searchMemoryBrain } from '@/lib/memory-brain';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function deterministicReply(query, matches, range) {
  if (!matches.length) {
    return 'I could not find evidence for that in your saved library yet. Try a different person, place, event, year, or upload more memories for LifeGPT to understand.';
  }
  const photos = matches.filter((item) => item.kind === 'photo').length;
  const videos = matches.filter((item) => item.kind === 'video').length;
  const chronological = [...matches].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const first = chronological[0];
  const latest = chronological[chronological.length - 1];
  const q = normalize(query);
  if (/\bwhen\b/.test(q) && first?.createdAt) {
    const date = new Date(first.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return `The earliest matching memory I found is from ${date}. I found ${matches.length} grounded source ${matches.length === 1 ? 'item' : 'items'} in total.`;
  }
  if (/\b(latest|recent|newest)\b/.test(q) && latest?.createdAt) {
    const date = new Date(latest.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return `Your latest matching memory is from ${date}. I found ${matches.length} matching ${matches.length === 1 ? 'memory' : 'memories'}.`;
  }
  const period = range ? ` for ${range.label}` : '';
  return `I found ${matches.length} grounded ${matches.length === 1 ? 'memory' : 'memories'}${period}: ${photos} ${photos === 1 ? 'photo' : 'photos'} and ${videos} ${videos === 1 ? 'video' : 'videos'}. Each result includes why it matched and a confidence score.`;
}

function wantsNarrative(query) {
  return /\b(summarize|summary|story|write|describe|recap|highlights|speech|caption|post)\b/i.test(query || '');
}

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await request.json().catch(() => ({}));
    const query = String(body.query || '').trim();
    if (!query) return json({ error: 'Query is required' }, 400);
    if (query.length > 1200) return json({ error: 'Please shorten your LifeGPT request to 1,200 characters or less.' }, 400);

    const db = await getDb();
    const items = await db.collection('media')
      .find({ userId: user.id, trashed: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(1000)
      .toArray();

    const { matches, range, terms } = searchMemoryBrain(items, query, { limit: 12 });

    if (!wantsNarrative(query) || !matches.length) {
      return json({
        reply: deterministicReply(query, matches, range),
        matches,
        grounded: true,
        usedAi: false,
        creditsUsed: 0,
        memoryBrain: { indexed: items.length, queryTerms: terms, explainable: true },
        note: 'Memory Brain search, scoring, grouping signals and retrieval use existing intelligence and consume 0 AI Credits.',
      });
    }

    const evidence = matches.map((item, index) => ({
      source: index + 1,
      id: item.id,
      date: item.createdAt,
      name: item.name,
      kind: item.kind,
      description: item.description,
      caption: item.caption,
      tags: item.tags,
      people: item.people,
      locations: item.locations,
      album: item.album,
      textInside: item.textInside,
      memoryScore: item.qualityScore,
      matchConfidence: item.confidence,
      matchReasons: item.reasons,
    }));

    const strictPrompt = [
      'You are LifeGPT, SnapNext\'s private memory assistant.',
      'Answer ONLY from the evidence JSON below.',
      'Never invent people, relationships, places, dates, feelings, events, or facts.',
      'If evidence is insufficient, say so plainly.',
      'Use concise, warm language and cite evidence inline as [1], [2], etc.',
      'Do not treat a detected face label as a family relationship unless the evidence explicitly contains that relationship label.',
      `User request: ${query}`,
      `Evidence JSON: ${JSON.stringify(evidence).slice(0, 14000)}`,
    ].join('\n');

    const result = await runAiTask({
      db,
      user,
      feature: 'chat',
      input: { query, groundedMemoryIds: matches.map((item) => item.id) },
      prompt: strictPrompt,
      request,
    });

    if (!result.ok) {
      return json({
        reply: deterministicReply(query, matches, range),
        matches,
        grounded: true,
        usedAi: false,
        creditsUsed: 0,
        aiDeferred: true,
        memoryBrain: { indexed: items.length, queryTerms: terms, explainable: true },
        note: result.error?.message || 'Narrative AI is temporarily unavailable; grounded Memory Brain results are still shown.',
      });
    }

    const reply = result.result?.reply || result.result?.summary || result.result?.caption || deterministicReply(query, matches, range);
    return json({
      reply,
      matches,
      grounded: true,
      usedAi: true,
      creditsUsed: result.meta?.creditsUsed ?? result.meta?.credits ?? null,
      memoryBrain: { indexed: items.length, queryTerms: terms, explainable: true },
      meta: result.meta || null,
    });
  } catch (error) {
    console.error('[lifegpt] query failed', error?.message);
    return json({ error: 'LifeGPT could not complete that request right now.' }, 500);
  }
}
