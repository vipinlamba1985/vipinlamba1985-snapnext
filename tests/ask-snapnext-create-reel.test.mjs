import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chat = fs.readFileSync(new URL('../app/(app)/chat/page.js', import.meta.url), 'utf8');
const reel = fs.readFileSync(new URL('../app/(app)/create/reel/page.js', import.meta.url), 'utf8');
const prepare = fs.readFileSync(new URL('../app/api/create/reels/prepare/route.js', import.meta.url), 'utf8');
const render = fs.readFileSync(new URL('../app/api/create/reels/render/route.js', import.meta.url), 'utf8');
const studio = fs.readFileSync(new URL('../app/(app)/ai-studio/page.js', import.meta.url), 'utf8');

test('Ask SnapNext carries grounded matches into Create without putting media ids in the URL', () => {
  assert.match(chat, /CREATE_REEL_HANDOFF_KEY = 'snapnext:create-reel-handoff:v1'/);
  assert.match(chat, /sessionStorage\.setItem\(CREATE_REEL_HANDOFF_KEY/);
  assert.match(chat, /CREATE_REEL_HANDOFF_MAX_MEDIA = 20/);
  assert.match(chat, /expiresAt: now \+ CREATE_REEL_HANDOFF_TTL_MS/);
  assert.match(chat, /action\?\.id !== 'continue-in-create'/);
  assert.doesNotMatch(chat, /\/create\/reel\?[^'"`]*media/i);
});

test('Create owns normal memory Reels while premium AI Video remains a separate surface', () => {
  assert.match(studio, /id: 'reel'[^\n]+href: '\/create\/reel'/);
  assert.doesNotMatch(studio, /id: 'reel'[^\n]+href: '\/ai-video'/);
  assert.match(reel, /Memory Reel/);
});

test('Reel handoff is client-local but every source is reverified server-side', () => {
  assert.match(reel, /safeHandoff\(\)/);
  assert.match(reel, /sessionStorage\.getItem\(CREATE_REEL_HANDOFF_KEY/);
  assert.match(reel, /apiFetch\('\/create\/reels\/prepare'/);
  assert.match(prepare, /userId: user\.id/);
  assert.match(prepare, /trashed: \{ \$ne: true \}/);
  assert.match(prepare, /kind: \{ \$in: \['photo', 'video'\] \}/);
  assert.match(prepare, /contentHash\(doc\)/);
  assert.match(prepare, /reel_source_hash_unavailable/);
});

test('Reel preview is bounded and does not reserve spend or call an AI provider', () => {
  assert.match(prepare, /const MAX_SCENES = 20/);
  assert.match(prepare, /const MAX_TOTAL_MS = 60000/);
  assert.match(prepare, /getCanonicalRenderQuotaSnapshot/);
  assert.match(prepare, /canonicalRenderProviderStatus/);
  assert.doesNotMatch(prepare, /runAiTask|submitVideoGenerationJob|reserveCanonicalRenderQuota|reserveProductSpend|fetch\s*\(/);
  assert.match(prepare, /Preview preparation verifies ownership, source hashes, duration limits and soundtrack license without reserving quota or calling an AI provider/);
});

test('canonical Reel execution remains behind a separate explicit approval', () => {
  assert.match(reel, /data-testid="create-reel-preview"/);
  assert.match(reel, /data-testid="create-reel-render"/);
  assert.match(reel, /apiFetch\('\/create\/reels\/render'/);
  assert.match(render, /prepareCanonicalRender/);
  assert.match(render, /canonicalRenderProviderStatus/);
  assert.match(render, /render_provider_not_configured/);
});

test('ready canonical Reels expose download and file-share only after server release', () => {
  assert.match(reel, /renderState\?\.downloadUrl/);
  assert.match(reel, /data-testid="create-reel-download"/);
  assert.match(reel, /navigator\.canShare\?\.\(\{ files: \[file\] \}\)/);
  assert.doesNotMatch(reel, /navigator\.share\(\{[^}]*url:/s);
});
