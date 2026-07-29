import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('AI model configuration uses current configurable model families', () => {
  const models = read('lib/ai/models.js');
  assert.match(models, /gpt-5\.6-luna/);
  assert.match(models, /gpt-5\.6-terra/);
  assert.match(models, /gpt-5\.6-sol/);
  assert.match(models, /gemini-3\.5-flash/);
  assert.match(models, /gemini-3\.5-flash-lite/);
  assert.match(models, /whisper-large-v3-turbo/);
  assert.match(models, /RETIRED_AI_MODELS/);
});

test('the task registry is the authoritative source for Starter limits and cost ceilings', () => {
  const registry = read('lib/ai/registry.js');
  assert.match(registry, /starter: planLimit\('starter'/);
  assert.match(registry, /AI_TASK_REGISTRY/);
  assert.match(registry, /upload_image_analysis/);
  assert.match(registry, /upload_video_analysis/);
  assert.match(registry, /image_create/);
  assert.match(registry, /photo_enhance/);
  assert.match(registry, /avatar_motion/);
  assert.match(registry, /short_video_generation/);
  assert.match(registry, /approvalRequired: true/);
  assert.match(registry, /validateAiTaskRegistry/);
});

test('all aliased text AI calls default to gateway v2 with an emergency rollback', () => {
  const paths = read('jsconfig.json');
  const wrapper = read('lib/ai-router-budgeted.js');
  const router = read('lib/ai-router-v2.js');
  assert.match(paths, /ai-router-budgeted\.js/);
  assert.match(wrapper, /AI_GATEWAY_V2_ENABLED/);
  assert.match(wrapper, /gatewayV2\.runAiTask/);
  assert.match(wrapper, /legacy\.runAiTask/);
  assert.match(router, /executeAiGatewayTask/);
  assert.match(router, /actualCostUsd/);
  assert.match(router, /costBasis/);
  assert.doesNotMatch(router, /gemini-2\.0-flash/);
  assert.doesNotMatch(router, /gpt-4o-mini/);
});

test('the gateway reserves, settles, releases, audits, retries, and requires approval', () => {
  const gateway = read('lib/ai/gateway.js');
  assert.match(gateway, /reserveExternalAiSpend/);
  assert.match(gateway, /settleExternalAiSpend/);
  assert.match(gateway, /releaseExternalAiSpend/);
  assert.match(gateway, /ai_audit/);
  assert.match(gateway, /approval_required/);
  assert.match(gateway, /deterministic_hit/);
  assert.match(gateway, /cache_hit/);
  assert.match(gateway, /executeResilient/);
  assert.match(gateway, /ceiling_fallback/);
});

test('direct media, transcription, and TTS workloads use the same gateway', () => {
  const direct = read('lib/budgeted-direct-ai.js');
  assert.match(direct, /executeAiGatewayTask/);
  assert.match(direct, /upload_image_analysis/);
  assert.match(direct, /upload_video_analysis/);
  assert.match(direct, /audio_transcription/);
  assert.match(direct, /voice_tts/);
  assert.match(direct, /whisper-large-v3-turbo|AI_MODELS\.groq\.transcription/);
  assert.doesNotMatch(direct, /reserveExternalAiSpend/);
});

test('expensive visual routes share protected provider execution and explicit confirmation', () => {
  for (const path of [
    'app/api/ai-create-image/route.js',
    'app/api/ai-enhance-photo/route.js',
    'app/api/ai-avatar-motion/route.js',
  ]) {
    const route = read(path);
    assert.match(route, /executeVisualProviderTask/);
    assert.match(route, /approval_required/);
    assert.match(route, /approved: true/);
    assert.match(route, /actualCostUsd/);
    assert.doesNotMatch(route, /estimatedCost:\s*0/);
  }
});

test('AI economy preview derives budgets from current plans and registry ceilings', () => {
  const aiOs = read('lib/ai-os.js');
  assert.match(aiOs, /getPlan\(plan\)/);
  assert.match(aiOs, /aiTaskCostCeiling\(feature\)/);
  assert.match(aiOs, /weeklyExternalAiUsd/);
  assert.doesNotMatch(aiOs, /plus:\s*9\.99/);
  assert.doesNotMatch(aiOs, /pro:\s*19\.99/);
  assert.doesNotMatch(aiOs, /family:\s*29\.99/);
});

test('creation buttons explicitly confirm the displayed Credit charge', () => {
  const imagePage = read('app/(app)/ai-studio/image/page.js');
  const avatarPage = read('app/(app)/ai-studio/avatar-motion/page.js');
  assert.match(imagePage, /approved: true/);
  assert.match(imagePage, /confirms this Credit charge/);
  assert.match(avatarPage, /approved: true/);
  assert.match(avatarPage, /confirms the displayed Credit charge/);
});
