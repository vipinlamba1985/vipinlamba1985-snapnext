import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { runAiTask } from '@/lib/ai-router';
import { buildMemoryIndex } from '@/lib/memory-brain';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function publicStory(story) {
  const { _id, userId, sourceHash, ...safe } = story;
  return safe;
}

export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const db = await getDb();
    const [events, stories] = await Promise.all([
      db.collection('memory_events').find({ userId: user.id, deleted: { $ne: true } }).sort({ updatedAt: -1 }).limit(100).toArray(),
      db.collection('memory_stories').find({ userId: user.id, deleted: { $ne: true } }).sort({ updatedAt: -1 }).limit(50).toArray(),
    ]);
    return json({
      events: events.map(({ _id, userId, ...event }) => event),
      stories: stories.map(publicStory),
      privacy: 'Stories are private drafts until the user explicitly shares or exports them.',
    });
  } catch (error) {
    console.error('[memory-stories] load failed', error?.message);
    return json({ error: 'Stories are temporarily unavailable.' }, 500);
  }
}

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const eventId = clean(body.eventId, 100);
    const tone = clean(body.tone || 'warm', 40).toLowerCase();
    const length = ['short', 'medium', 'long'].includes(body.length) ? body.length : 'medium';
    if (!eventId) return json({ error: 'Choose a confirmed event.' }, 400);

    const db = await getDb();
    const event = await db.collection('memory_events').findOne({ userId: user.id, id: eventId, deleted: { $ne: true } });
    if (!event) return json({ error: 'Confirmed event not found.' }, 404);
    const memoryIds = [...new Set(Array.isArray(event.memoryIds) ? event.memoryIds : [])].slice(0, 80);
    if (!memoryIds.length) return json({ error: 'This event has no confirmed memories yet.' }, 400);

    const media = await db.collection('media')
      .find({ userId: user.id, id: { $in: memoryIds }, trashed: { $ne: true } })
      .sort({ createdAt: 1 })
      .limit(80)
      .toArray();
    if (!media.length) return json({ error: 'The confirmed memories are no longer available.' }, 404);

    const sources = media.map(buildMemoryIndex).map((item, index) => ({
      source: index + 1,
      id: item.id,
      name: item.name,
      kind: item.kind,
      date: item.createdAt,
      description: item.description,
      caption: item.caption,
      people: item.people,
      locations: item.locations,
      tags: item.tags,
      textInside: item.textInside,
      memoryScore: item.qualityScore,
    }));
    const sourceHash = createHash('sha256')
      .update(JSON.stringify({ eventId, tone, length, sources: sources.map(({ id, date, description, caption, people, locations, tags }) => ({ id, date, description, caption, people, locations, tags })) }))
      .digest('hex');

    const cached = await db.collection('memory_stories').findOne({ userId: user.id, sourceHash, deleted: { $ne: true } });
    if (cached) return json({ story: publicStory(cached), cached: true, creditsUsed: 0 });

    const wordTarget = length === 'short' ? '100-160' : length === 'long' ? '450-650' : '220-350';
    const prompt = [
      "You are LifeGPT, SnapNext's private and grounded memory storyteller.",
      'Write only from the confirmed event and evidence JSON below.',
      'Never invent relationships, locations, dates, emotions, dialogue, weather, activities, or facts.',
      'If evidence is incomplete, use careful language such as “the saved memories show”.',
      'Cite supporting memories inline as [1], [2], etc.',
      'Return a title followed by a warm story in plain text. Do not use markdown tables.',
      `Tone: ${tone}. Target length: ${wordTarget} words.`,
      `Confirmed event: ${event.title}`,
      `Event notes: ${event.notes || 'None'}`,
      `Evidence JSON: ${JSON.stringify(sources).slice(0, 18000)}`,
    ].join('\n');

    const result = await runAiTask({
      db,
      user,
      feature: 'chat',
      input: { eventId, memoryIds: sources.map((item) => item.id), task: 'grounded_story', tone, length },
      prompt,
      request,
    });
    if (!result.ok) {
      return json({ error: result.error?.message || 'Story generation is temporarily unavailable. No draft was saved.' }, 503);
    }

    const generated = clean(result.result?.reply || result.result?.story || result.result?.summary, 12000);
    if (!generated) return json({ error: 'The AI returned an empty story. Reserved credits were not used for a saved draft.' }, 502);
    const lines = generated.split('\n').map((line) => line.trim()).filter(Boolean);
    const now = new Date();
    const story = {
      id: randomUUID(),
      userId: user.id,
      eventId,
      eventTitle: event.title,
      title: clean(lines[0].replace(/^#+\s*/, ''), 160) || event.title,
      body: lines.slice(1).join('\n\n') || generated,
      tone,
      length,
      sourceIds: sources.map((item) => item.id),
      sources,
      sourceHash,
      grounded: true,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    await db.collection('memory_stories').insertOne(story);
    return json({ story: publicStory(story), cached: false, creditsUsed: result.meta?.creditsUsed ?? result.meta?.credits ?? null });
  } catch (error) {
    console.error('[memory-stories] generation failed', error?.message);
    return json({ error: 'Story generation could not be completed.' }, 500);
  }
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const id = clean(body.id, 100);
  if (!id) return json({ error: 'Story ID is required.' }, 400);
  const db = await getDb();
  const result = await db.collection('memory_stories').updateOne(
    { userId: user.id, id },
    { $set: { deleted: true, deletedAt: new Date(), updatedAt: new Date() } },
  );
  if (!result.matchedCount) return json({ error: 'Story not found.' }, 404);
  return json({ ok: true });
}
