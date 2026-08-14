import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildReadyStoryCandidates, describeAnnualEventTiming, READY_STORY_MEDIA_LIMIT } from '../lib/ready-story-drafts.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const photo = (id, at, place = '', people = [], tags = [], extras = {}) => ({
  id,
  kind: 'photo',
  capturedAt: at,
  createdAt: at,
  people,
  ...extras,
  aiAnalysis: { locations: place ? [place] : [], tags, ...(extras.aiAnalysis || {}) },
});

test('celebrations prioritize upcoming and just-passed dates', () => {
  const now = new Date('2026-08-13T12:00:00Z');
  assert.equal(describeAnnualEventTiming('1990-08-14', now).label, 'Tomorrow');
  assert.equal(describeAnnualEventTiming('1990-08-11', now).label, '2 days ago');
});

test('birthday drafts use linked photos and require approval', () => {
  const items = buildReadyStoryCandidates({
    media: [
      photo('a', '2023-08-14T12:00:00Z', '', ['Maya']),
      photo('b', '2024-08-13T12:00:00Z', '', ['Maya']),
      photo('c', '2025-08-15T12:00:00Z', '', ['Maya']),
      photo('x', '2025-08-14T12:00:00Z', '', ['Other']),
    ],
    profiles: [{ id: 'maya', name: 'Maya', birthday: '1990-08-14' }],
    now: new Date('2026-08-13T12:00:00Z'),
  });
  const story = items.find(item => item.type === 'birthday');
  assert.ok(story);
  assert.deepEqual(story.mediaIds.sort(), ['a', 'b', 'c']);
  assert.equal(story.autoPost, false);
  assert.equal(story.approvalRequired, true);
});

test('old trip becomes a richer smart story with reel frames', () => {
  const media = [8, 10, 12, 14, 16, 17, 18, 19].map((hour, i) => photo(`t${i}`, `2024-06-01T${String(hour).padStart(2, '0')}:00:00Z`, 'Montreal', [], ['travel', 'vacation']));
  const story = buildReadyStoryCandidates({ media, now: new Date('2026-08-13T12:00:00Z') }).find(item => item.type === 'trip');
  assert.ok(story);
  assert.equal(story.sourceCount, 8);
  assert.equal(story.collageMediaIds.length, 6);
  assert.equal(story.reelMediaIds.length, 8);
  assert.equal(story.reelFrames.length, 8);
  assert.ok(['editorial', 'cinema', 'magazine'].includes(story.collageLayout));
});

test('event semantics stop a wedding from being mislabeled as a trip', () => {
  const media = [8, 10, 12, 14, 16, 18].map((hour, i) => photo(`w${i}`, `2026-06-30T${String(hour).padStart(2, '0')}:00:00Z`, 'Wedding Hall', [], ['wedding', i % 2 ? 'bride' : 'groom']));
  const items = buildReadyStoryCandidates({ media, now: new Date('2026-08-13T12:00:00Z') });
  assert.ok(items.find(item => item.type === 'wedding'));
  assert.equal(items.some(item => item.type === 'trip'), false);
});

test('ready-story API is bounded, scoped and contains no AI provider call', async () => {
  const route = await read('app/api/ready-story-drafts/route.js');
  assert.equal(READY_STORY_MEDIA_LIMIT <= 1500, true);
  assert.match(route, /getUserFromRequest/);
  assert.match(route, /userId: ctx\.user\.id/);
  assert.match(route, /creative_projects/);
  assert.doesNotMatch(route, /runAiTask|generateContent|openai|gemini/i);
});

test('Home auto-plays a muted motion story, offers free CC0 audio and keeps review explicit', async () => {
  const home = await read('components/home/HomeReadyStories.js');
  const visuals = await read('components/ready-stories/StoryVisuals.js');
  const reelAudio = await read('components/ready-stories/StoryReelAudio.js');
  const audioCatalog = await read('lib/ready-story-audio.js');
  const page = await read('app/(app)/ready-story/[id]/page.js');
  const editor = await read('components/ready-stories/ReadyStoryEditor.js');
  assert.match(home, /Private until you choose to share/);
  assert.match(home, /StoryReelAudio/);
  assert.match(visuals, /Memory reel · muted/);
  assert.match(visuals, /setInterval/);
  assert.match(visuals, /prefers-reduced-motion/);
  assert.match(reelAudio, /preload="none"/);
  assert.match(reelAudio, /Play free story soundtrack/);
  assert.match(reelAudio, /audio\.volume = 0\.28/);
  assert.match(audioCatalog, /CC0-1\.0/);
  assert.match(audioCatalog, /Wikimedia Commons/);
  assert.match(audioCatalog, /Chill Beat/);
  assert.match(page, /ReadyStorySmartShowcase/);
  assert.match(editor, /document\.createElement\('canvas'\)/);
  assert.match(editor, /navigator\.share/);
});
