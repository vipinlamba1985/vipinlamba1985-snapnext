import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { runAiTask } from '@/lib/ai-router';

export const runtime = 'nodejs';

const STOP_WORDS = new Set([
  'a','about','all','an','and','are','at','be','did','do','for','from','give','i','in','is','it','me','my','of','on','or','please','show','tell','the','this','to','was','were','what','when','where','with','you',
  'memory','memories','photo','photos','picture','pictures','pic','pics','video','videos','find','latest','recent','saved',
]);

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function termsFor(query) {
  return normalize(query)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term))
    .slice(0, 12);
}

function searchableText(media) {
  const ai = media.aiAnalysis || {};
  return [
    media.name,
    media.kind,
    ai.autoAlbum,
    ai.description,
    ai.caption,
    ai.textInside,
    ...(ai.tags || []),
    ...(ai.faces || []),
    ...(ai.locations || []),
    ...(ai.emotions || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function dateRangeFor(query) {
  const q = normalize(query);
  const now = new Date();
  if (/\b(today)\b/.test(q)) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    return { start, end: now, label: 'today' };
  }
  if (/\b(yesterday)\b/.test(q)) {
    const end = new Date(now); end.setHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return { start, end, label: 'yesterday' };
  }
  if (/\b(last|past|previous) month\b/.test(q)) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end, label: start.toLocaleString('en-US', { month: 'long', year: 'numeric' }) };
  }
  if (/\b(this month)\b/.test(q)) {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: 'this month' };
  }
  if (/\b(last|past|previous) year\b/.test(q)) {
    const year = now.getFullYear() - 1;
    return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), label: String(year) };
  }
  if (/\b(this year)\b/.test(q)) {
    return { start: new Date(now.getFullYear(), 0, 1), end: now, label: String(now.getFullYear()) };
  }
  const yearMatch = q.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const year = Number(yearMatch[0]);
    return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), label: String(year) };
  }
  return null;
}

function scoreMedia(media, query, terms, range) {
  const q = normalize(query);
  const text = searchableText(media);
  let score = 0;
  for (const term of terms) {
    if (text.includes(term)) score += 8;
    if (normalize(media.name).includes(term)) score += 3;
    if ((media.aiAnalysis?.faces || []).some((face) => normalize(face).includes(term))) score += 4;
    if ((media.aiAnalysis?.locations || []).some((location) => normalize(location).includes(term))) score += 4;
  }
  if (/\b(photo|photos|picture|pictures|pic|pics)\b/.test(q) && media.kind === 'photo') score += 3;
  if (/\b(video|videos)\b/.test(q) && media.kind === 'video') score += 3;
  if (/\b(favorite|favourite|loved)\b/.test(q) && (media.favorite || media.isFavorite)) score += 6;
  if (/\b(latest|recent|newest)\b/.test(q)) score += Math.max(0, 5 - Math.floor((Date.now() - new Date(media.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)));
  if (range) {
    const date = new Date(media.createdAt);
    if (date >= range.start && date < range.end) score += 6;
    else return -1;
  }
  return score;
}

function publicMemory(media) {
  const ai = media.aiAnalysis || {};
  return {
    id: media.id,
    name: media.name,
    kind: media.kind,
    createdAt: media.createdAt,
    favorite: !!(media.favorite || media.isFavorite),
    description: ai.description || null,
    caption: ai.caption || null,
    tags: (ai.tags || []).slice(0, 12),
    people: (ai.faces || []).slice(0, 12),
    locations: (ai.locations || []).slice(0, 8),
    album: ai.autoAlbum || null,
    textInside: ai.textInside || null,
  };
}

function deterministicReply(query, matches, range) {
  if (!matches.length) {
    return 'I could not find evidence for that in your saved library yet. Try a different person, place, event, year, or upload more memories for LifeGPT to understand.';
  }
  const photos = matches.filter((item) => item.kind === 'photo').length;
  const videos = matches.filter((item) => item.kind === 'video').length;
  const first = matches[matches.length - 1];
  const latest = matches[0];
  const q = normalize(query);
  if (/\bwhen\b/.test(q) && first?.createdAt) {
    const date = new Date(first.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return `The earliest matching memory I found is from ${date}. I found ${matches.length} matching source ${matches.length === 1 ? 'item' : 'items'} in total.`;
  }
  if (/\b(latest|recent|newest)\b/.test(q) && latest?.createdAt) {
    const date = new Date(latest.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return `Your latest matching memory is from ${date}. I found ${matches.length} matching ${matches.length === 1 ? 'memory' : 'memories'}.`;
  }
  const period = range ? ` for ${range.label}` : '';
  return `I found ${matches.length} grounded ${matches.length === 1 ? 'memory' : 'memories'}${period}: ${photos} ${photos === 1 ? 'photo' : 'photos'} and ${videos} ${videos === 1 ? 'video' : 'videos'}. Every result below comes from your private SnapNext library.`;
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
      .limit(500)
      .toArray();

    const terms = termsFor(query);
    const range = dateRangeFor(query);
    const hasStructuredIntent = /\b(latest|recent|newest|favorite|favourite|photo|photos|video|videos|today|yesterday|month|year|when)\b/i.test(query);
    const ranked = items
      .map((media) => ({ media, score: scoreMedia(media, query, terms, range) }))
      .filter(({ score }) => score >= 0 && (score > 0 || (!terms.length && hasStructuredIntent)))
      .sort((a, b) => b.score - a.score || new Date(b.media.createdAt) - new Date(a.media.createdAt))
      .slice(0, 12)
      .map(({ media }) => publicMemory(media));

    if (!wantsNarrative(query) || !ranked.length) {
      return json({
        reply: deterministicReply(query, ranked, range),
        matches: ranked,
        grounded: true,
        usedAi: false,
        creditsUsed: 0,
        note: 'Search and retrieval use existing indexed intelligence and do not consume AI Credits.',
      });
    }

    const evidence = ranked.map((item, index) => ({
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
    }));

    const strictPrompt = [
      'You are LifeGPT, SnapNext\'s private memory assistant.',
      'Answer ONLY from the evidence JSON below.',
      'Never invent people, relationships, places, dates, feelings, events, or facts.',
      'If the evidence is insufficient, say so plainly.',
      'Use concise, warm language and cite evidence inline as [1], [2], etc.',
      `User request: ${query}`,
      `Evidence JSON: ${JSON.stringify(evidence).slice(0, 12000)}`,
    ].join('\n');

    const result = await runAiTask({
      db,
      user,
      feature: 'chat',
      input: { query, groundedMemoryIds: ranked.map((item) => item.id) },
      prompt: strictPrompt,
      request,
    });

    if (!result.ok) {
      return json({
        reply: deterministicReply(query, ranked, range),
        matches: ranked,
        grounded: true,
        usedAi: false,
        creditsUsed: 0,
        aiDeferred: true,
        note: result.error?.message || 'Narrative AI is temporarily unavailable; grounded search results are still shown.',
      });
    }

    const reply = result.result?.reply || result.result?.summary || result.result?.caption || deterministicReply(query, ranked, range);
    return json({
      reply,
      matches: ranked,
      grounded: true,
      usedAi: true,
      creditsUsed: result.meta?.creditsUsed ?? result.meta?.credits ?? null,
      meta: result.meta || null,
    });
  } catch (error) {
    console.error('[lifegpt] query failed', error?.message);
    return json({ error: 'LifeGPT could not complete that request right now.' }, 500);
  }
}
