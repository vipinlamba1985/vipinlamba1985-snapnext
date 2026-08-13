import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildReadyStoryCandidates, describeAnnualEventTiming, READY_STORY_MEDIA_LIMIT } from '../lib/ready-story-drafts.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const photo = (id, at, place = '', people = []) => ({ id, kind: 'photo', capturedAt: at, createdAt: at, people, aiAnalysis: { locations: place ? [place] : [] } });

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

test('old trip becomes a bounded collage draft', () => {
  const media = [8, 10, 12, 14, 16].map((hour, i) => photo(`t${i}`, `2024-06-01T${String(hour).padStart(2, '0')}:00:00Z`, 'Montreal'));
  const story = buildReadyStoryCandidates({ media, now: new Date('2026-08-13T12:00:00Z') }).find(item => item.type === 'trip');
  assert.ok(story);
  assert.equal(story.sourceCount, 5);
  assert.equal(story.collageMediaIds.length, 4);
});

test('ready-story API is bounded, scoped and contains no AI provider call', async () => {
  const route = await read('app/api/ready-story-drafts/route.js');
  assert.equal(READY_STORY_MEDIA_LIMIT <= 1500, true);
  assert.match(route, /getUserFromRequest/);
  assert.match(route, /userId: ctx\.user\.id/);
  assert.match(route, /creative_projects/);
  assert.doesNotMatch(route, /runAiTask|generateContent|openai|gemini/i);
});

test('Home review is explicit and collage export is local', async () => {
  const home = await read('components/home/HomeReadyStories.js');
  const layout = await read('app/(app)/dashboard/layout.js');
  const editor = await read('components/ready-stories/ReadyStoryEditor.js');
  assert.match(home, /Nothing is sent anywhere until you approve it/);
  assert.ok(layout.indexOf('<HomeReadyStories />') < layout.indexOf('{children}'));
  assert.match(editor, /document\.createElement\('canvas'\)/);
  assert.match(editor, /navigator\.share/);
});
