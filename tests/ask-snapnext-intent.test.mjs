import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ASK_SNAPNEXT_ACTION_VERSION,
  askSnapNextCapabilities,
  buildAskSnapNextActions,
  classifyAskSnapNextIntent,
} from '../lib/ask-snapnext-intent.js';

test('Ask SnapNext classifies common Life OS requests without a provider', () => {
  assert.equal(classifyAskSnapNextIntent('Find my passport photo'), 'search');
  assert.equal(classifyAskSnapNextIntent('When was our Montreal trip?'), 'search');
  assert.equal(classifyAskSnapNextIntent('Create a reel from my Montreal trip'), 'create_reel');
  assert.equal(classifyAskSnapNextIntent('Restore this old photo'), 'restore_photo');
  assert.equal(classifyAskSnapNextIntent('Enhance this blurry picture'), 'enhance_photo');
  assert.equal(classifyAskSnapNextIntent('Share these memories with my family'), 'share');
  assert.equal(classifyAskSnapNextIntent('Summarize my summer memories'), 'answer');
});

test('Ask SnapNext actions navigate only and never spend or share automatically', () => {
  const requests = [
    ['Find my passport photo', 2],
    ['Create a reel from this trip', 8],
    ['Restore this old photo', 1],
    ['Enhance this picture', 1],
    ['Share these with my family', 4],
  ];
  for (const [query, matchCount] of requests) {
    const actions = buildAskSnapNextActions({ query, matchCount });
    assert.ok(actions.length > 0);
    for (const action of actions) {
      assert.equal(action.version, ASK_SNAPNEXT_ACTION_VERSION);
      assert.equal(action.requiresUserTap, true);
      assert.equal(action.executesTask, false);
      assert.equal(action.spendsCredits, false);
      assert.equal(action.sharesMedia, false);
      assert.match(action.href, /^\/(gallery|ai-studio(?:\/(?:restoration|enhance))?|circles)$/);
      assert.doesNotMatch(action.href, /https?:|javascript:|data:/i);
    }
  }
});

test('ambiguous creation clarification cannot bypass the review step', () => {
  assert.deepEqual(buildAskSnapNextActions({ query: 'Create a reel', clarificationNeeded: true }), []);
});

test('capability examples teach the product without a blank prompt', () => {
  const capabilities = askSnapNextCapabilities();
  assert.equal(capabilities.length, 4);
  assert.ok(capabilities.some(item => /passport/i.test(item.example)));
  assert.ok(capabilities.some(item => /Montreal/i.test(item.example)));
  assert.ok(capabilities.some(item => /reel/i.test(item.example)));
});

test('Ask SnapNext intent routing remains pure and provider-free', () => {
  const source = fs.readFileSync(new URL('../lib/ask-snapnext-intent.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /openai|gemini|anthropic|rekognition|runAiTask|callAiProvider|fetch\s*\(/i);
});

test('Ask SnapNext stays a secondary intelligence surface and does not alter frozen primary nav', () => {
  const shell = fs.readFileSync(new URL('../components/AppShell.js', import.meta.url), 'utf8');
  assert.match(shell, /const PRIMARY_HREFS = \['\/dashboard', '\/gallery', '\/upload', '\/ai-studio', '\/circles'\]/);
  assert.doesNotMatch(shell, /PRIMARY_HREFS[^;]*\/chat/s);
});
