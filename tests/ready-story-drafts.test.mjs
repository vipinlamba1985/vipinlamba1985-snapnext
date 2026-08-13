import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildReadyStoryCandidates,
  describeAnnualEventTiming,
  READY_STORY_MEDIA_LIMIT,
} from '../lib/ready-story-drafts.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

function photo(id, at, place = '', people = []) {
  return {
    id,
    kind: 'photo',
    capturedAt: at,
    createdAt: at,
    people,
    aiAnalysis: { locations: place ? [place] : [] },
  };
}

test('annual celebration timing prioritizes upcoming and just-passed dates', () => {
  const now = new Date('2026-08-13T12:00:00Z');
  assert.deepEqual(describeAnnualEventTiming('1990-08-14T00:00:00Z', now), { relevant: true, label: 'Tomorrow', score: 35 });
  assert.deepEqual(describeAnnualEventTiming('1990-08-11T00:00:00Z', now), { relevant: true, label: '2 days ago', score: 31 });
  assert.equal(describeAnnualEventTiming('1990-11-20T00:00:00Z', now).relevant, false);
});

test('birthday stories use person-linked historical photos and never auto-post', () => {
  const now = new Date('2026-08-13T12:00:00Z');
  const media = [
    photo('b1', '2023-08-14T12:00:00Z', '', ['Maya']),
    photo('b2', '2024-08-13T12:00:00Z', '', ['Maya']),
    photo('b3', '2025-08-15T12:00:00Z', '', ['Maya']),
    photo('other', '2025-08-14T12:00:00Z', '', ['Someone else']),
  ];
  const stories = buildReadyStoryCandidates({
    media,
    profiles: [{ id: 'maya', name: 'Maya', birthday: '1990-08-14T00:00:00Z' }],
    now,
  });
  const birthday = stories.find(item => item.type === 'birthday');
  assert.ok(birthday);
  assert.equal(birthday.kicker, 'Tomorrow');
  assert.deepEqual(birthday.mediaIds.sort(), ['b1', 'b2', 'b3']);
  assert.equal(birthday.autoPost, false);
  assert.equal(birthday.approvalRequired, true);
});

test('old travel runs become cost-free trip collage drafts', () => {
  const media = [8, 10, 12, 14, 16].map((hour, index) => photo(`t${index}`, `2024-06-01T${hour}:00:00Z`, 'Montreal'));
  const stories = buildReadyStoryCandidates({ media, now: new Date('2026-08-13T12:00:00Z') });
  const trip = stories.find(item => item.type === 'trip');
  assert.ok(trip);
  assert.match(trip.title, /Montreal/i);
  assert.equal(trip.sourceCount, 5);
  assert.equal(trip.collageMediaIds.length, 4);
});

test('on-this-day can form a story without calling an AI provider', () => {
  const media = [
    photo('d1', '2021-08-13T08:00:00Z'),
    photo('d2', '2022-08-13T09:00:00Z'),
    photo('d3', '2024-08-13T10:00:00Z'),
  ];
  const stories = buildReadyStoryCandidates({ media, now: new Date('2026-08-13T12:00:00Z') });
  const today = stories.find(item => item.type === 'on-this-day');
  assert.ok(today);
  assert.equal(today.sourceCount, 3);
  assert.equal(today.generator, 'ready-story-v1');
});

test('ready story candidates deduplicate heavily overlapping sources', () => {
  const media = [
    photo('a', '2024-01-01T10:00:00Z'),
    photo('b', '2024-01-01T11:00:00Z'),
    photo('c', '2024-01-01T12:00:00Z'),
    photo('d', '2024-01-01T13:00:00Z'),
  ];
  const stories = buildReadyStoryCandidates({
    media,
    memoryEvents: [{ id: 'event', title: 'New Year', memoryIds: ['a', 'b', 'c', 'd'] }],
    stories: [{ id: 'story', title: 'New Year Story', sourceIds: ['a', 'b', 'c', 'd'], body: 'A grounded draft.' }],
    now: new Date('2026-08-13T12:00:00Z'),
  });
  assert.equal(stories.filter(item => item.mediaIds.includes('a')).length, 1);
});

test('ready story API is user-scoped, bounded and contains no automatic AI execution', async () => {
  const route = await read(path.join('app', 'api', 'ready-story-drafts', 'route.js'));
  assert.match(route, /getUserFromRequest/);
  assert.match(route, /userId: ctx\.user\.id/);
  assert.match(route, /READY_STORY_MEDIA_LIMIT/);
  assert.equal(READY_STORY_MEDIA_LIMIT <= 1500, true);
  assert.doesNotMatch(route, /runAiTask|generateContent|openai|gemini/i);
  assert.match(route, /autoPost: false/);
  assert.match(route, /approvalRequired: true/);
  assert.match(route, /COLLECTION = 'creative_projects'/);
  assert.match(route, /PROJECT_KIND = 'ready-story'/);
});

test('Home presents ready collages before secondary prompts and review remains explicit', async () => {
  const component = await read(path.join('components', 'home', 'HomeReadyStories.js'));
  const layout = await read(path.join('app', '(app)', 'dashboard', 'layout.js'));
  assert.match(component, /Stories already made from your memories/);
  assert.match(component, /collageMediaIds/);
  assert.match(component, /ready-story\//);
  assert.match(component, /Nothing is sent anywhere until you approve it/);
  assert.match(layout, /<HomeReadyStories \/>/);
  assert.ok(layout.indexOf('<HomeReadyStories />') < layout.indexOf('{children}'));
  assert.match(layout, /home-primary-action/);
  assert.match(layout, /home-story-carousel/);
});

test('ready story review exports the collage locally and uses explicit Web Share', async () => {
  const editor = await read(path.join('components', 'ready-stories', 'ReadyStoryEditor.js'));
  assert.match(editor, /document\.createElement\('canvas'\)/);
  assert.match(editor, /canvas\.toBlob/);
  assert.match(editor, /navigator\.share/);
  assert.match(editor, /auto-post/);
  assert.doesNotMatch(editor, /runAiTask|generateContent/);
});

test('ready story manifests inherit existing creative project account deletion', async () => {
  const plan = await read(path.join('lib', 'account-deletion-plan.js'));
  const deletion = await read(path.join('lib', 'account-deletion.js'));
  assert.match(plan, /creativeProjects: \{ userId \}/);
  assert.match(deletion, /collection\('creative_projects'\)\.deleteMany\(filters\.creativeProjects\)/);
});
