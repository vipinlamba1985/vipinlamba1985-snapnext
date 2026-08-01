// Every creative feature must be honest about what it costs: a feature that
// calls an external model is metered before it runs, and a feature that does
// not must not claim to charge for one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CREATIVE_BILLING,
  CREATIVE_FEATURES,
  billingDisclosure,
  creativeFeature,
  isMeteredFeature,
  meteredFeatureIds,
} from '../lib/creative-credits.js';
import { buildEmojis, buildHashtags, toHashtag } from '../lib/post-composer.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

test('every creative feature declares a known billing mode', () => {
  const modes = new Set(Object.values(CREATIVE_BILLING));
  for (const feature of Object.values(CREATIVE_FEATURES)) {
    assert.ok(modes.has(feature.billing), `${feature.id} has an unknown billing mode`);
    assert.equal(typeof feature.label, 'string');
    assert.ok(feature.grounding, `${feature.id} must explain itself to the user`);
  }
});

test('free features cost nothing and metered features cost something', () => {
  for (const feature of Object.values(CREATIVE_FEATURES)) {
    if (feature.billing === CREATIVE_BILLING.FREE) {
      assert.equal(feature.credits, 0, `${feature.id} is free but declares a price`);
    }
    if (feature.billing === CREATIVE_BILLING.METERED) {
      assert.ok(feature.credits > 0, `${feature.id} is metered but declares no cost`);
    }
  }
  assert.deepEqual(meteredFeatureIds(), ['photo_enhance']);
  assert.equal(isMeteredFeature('photo_enhance'), true);
  assert.equal(isMeteredFeature('post_caption'), false);
  assert.equal(isMeteredFeature('nonsense'), false);
  assert.equal(creativeFeature('nonsense'), null);
});

test('the disclosure tells the client what a button will cost', () => {
  assert.deepEqual(billingDisclosure('post_caption'), {
    feature: 'post_caption',
    label: 'Post caption',
    billing: 'included_free',
    credits: 0,
    freeOnEveryPlan: true,
    grounding: CREATIVE_FEATURES.post_caption.grounding,
  });
  assert.equal(billingDisclosure('photo_enhance').freeOnEveryPlan, false);
  assert.equal(billingDisclosure('nonsense'), null);
});

test('metered features reserve credits through the spend gate before running', async () => {
  // photo_enhance is the only metered creative feature today. It must go
  // through the gateway, which reserves, then settles or releases.
  const route = await read(path.join('app', 'api', 'ai-enhance-photo', 'route.js'));
  assert.match(route, /executeVisualProviderTask/);
  // It must also refuse to start until the user has seen the price.
  assert.match(route, /approval_required/);
  assert.match(route, /body\.approved !== true/);

  const gateway = await read(path.join('lib', 'ai', 'gateway.js'));
  assert.match(gateway, /reserveExternalAiSpend/);
  assert.match(gateway, /settleExternalAiSpend/);
  assert.match(gateway, /releaseExternalAiSpend/);
});

test('restoration stays on prepaid credits and off the weekly allowance', async () => {
  assert.equal(CREATIVE_FEATURES.photo_restoration.billing, CREATIVE_BILLING.PREPAID);
  const route = await read(path.join('app', 'api', 'ai-enhance-photo', 'route.js'));
  assert.match(route, /restoration_pack_required/);
});

test('free post-composer routes never reach a provider', async () => {
  const routes = ['caption', 'hashtags', 'emojis'];
  for (const name of routes) {
    const source = await read(path.join('app', 'api', 'ai', name, 'route.js'));
    // No provider call of any kind.
    assert.doesNotMatch(source, /executeAiGatewayTask|executeVisualProviderTask|openai|fetch\(/i, `${name} must stay free`);
    // Declares its billing so the UI can say so before the user clicks.
    assert.match(source, /billingDisclosure\('post_/, `${name} must disclose billing`);
    // Still requires a session.
    assert.match(source, /getUserFromRequest/, `${name} must authenticate`);
    assert.match(source, /unauthenticated/, `${name} must reject anonymous callers`);
  }
});

test('the post composer is pure and deterministic', async () => {
  const source = await read(path.join('lib', 'post-composer.js'));
  assert.doesNotMatch(source, /^import /m);

  const input = { text: 'Beach trip with family at sunset', tags: ['Holiday'] };
  assert.deepEqual(buildHashtags(input), buildHashtags(input), 'same input, same output');
  assert.equal(buildEmojis('Beach trip'), buildEmojis('Beach trip'));
});

test('hashtags prefer the user own tags and stay well formed', () => {
  const tags = buildHashtags({ text: 'A day at the beach with the family', tags: ['Summer 2024', 'x'] });
  assert.equal(tags[0], '#Summer2024', 'the user own tag comes first');
  assert.ok(!tags.includes('#x'), 'single characters are not hashtags');
  assert.ok(tags.every(tag => /^#[A-Za-z0-9]+$/.test(tag)), 'hashtags contain no punctuation');
  assert.ok(!tags.some(tag => tag.toLowerCase() === '#with'), 'stopwords are dropped');
  assert.ok(tags.length <= 13);

  // Never returns nothing, even with useless input.
  assert.deepEqual(buildHashtags({ text: 'a of the', tags: [] }), ['#SnapNext', '#Memories']);
  assert.deepEqual(buildHashtags(), ['#SnapNext', '#Memories']);
  assert.equal(toHashtag('!!!'), '');
});

test('emojis match words that are actually present', () => {
  assert.equal(buildEmojis('Her birthday party'), '🎂');
  assert.ok(buildEmojis('A beach holiday in the mountains').includes('🌊'));
  // Nothing recognised still returns something usable rather than empty.
  assert.equal(buildEmojis('zzz'), '✨');
  assert.equal(buildEmojis(''), '✨');
  assert.ok(buildEmojis('beach mountain travel food dog', 2).length <= 4);
});
