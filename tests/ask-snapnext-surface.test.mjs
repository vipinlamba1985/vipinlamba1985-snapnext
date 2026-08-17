import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chat = fs.readFileSync(new URL('../app/(app)/chat/page.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../app/api/lifegpt/route.js', import.meta.url), 'utf8');
const launcher = fs.readFileSync(new URL('../components/AskSnapNextLauncher.js', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../app/(app)/layout.js', import.meta.url), 'utf8');

test('Ask SnapNext replaces the LifeGPT product name without duplicating the backend', () => {
  assert.match(chat, /Ask SnapNext/);
  assert.match(chat, /apiFetch\('\/lifegpt'/);
  assert.doesNotMatch(chat, /I am LifeGPT|Ask LifeGPT|>LifeGPT</);
  assert.match(route, /buildAskSnapNextActions/);
});

test('Ask SnapNext teaches concrete Life OS examples instead of a blank chatbot prompt', () => {
  assert.match(chat, /Find my passport photo/);
  assert.match(chat, /When was our Montreal trip/);
  assert.match(chat, /Summarize my summer memories/);
  assert.match(chat, /Prepare a reel from my latest trip/);
});

test('Ask SnapNext renders only explicit navigation actions returned by the server', () => {
  assert.match(chat, /response\.actions \|\| \[\]/);
  assert.match(chat, /ask-snapnext-actions/);
  assert.match(chat, /href=\{action\.href\}/);
  assert.match(route, /actions: actionsFor\(query, matches\)/);
});

test('Ask SnapNext keeps paid narrative generation on the existing centralized gateway', () => {
  assert.match(route, /runAiTask\(/);
  assert.match(route, /feature: 'chat'/);
  assert.doesNotMatch(route, /AI_TASK_REGISTRY\s*=|reserveAiSpend\(|ai_cost_ledger/);
});

test('Ask SnapNext is globally reachable without becoming a sixth primary destination', () => {
  assert.match(layout, /<AskSnapNextLauncher \/>/);
  assert.match(launcher, /href="\/chat"/);
  assert.match(launcher, /ask-snapnext-launcher/);
  assert.match(launcher, /pathname === '\/chat'/);
  assert.doesNotMatch(launcher, /PRIMARY_HREFS|primary-mobile-nav/);
});
