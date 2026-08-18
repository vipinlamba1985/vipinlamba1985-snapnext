import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildCreatedReelReadyStoryCandidates,
  isSavedCanonicalReel,
} from '../lib/created-reel-ready-story.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const savedReel = {
  id: 'reel-artifact-1',
  kind: 'video',
  mime: 'video/mp4',
  createdAt: '2026-08-18T12:00:00.000Z',
  uploadedAt: '2026-08-18T12:00:00.000Z',
  sourceMediaIds: ['photo-a', 'photo-b', 'clip-c'],
  creativeOrigin: {
    type: 'canonical-reel-v1',
    renderArtifactId: 'artifact-1',
    manifestHash: 'abc123',
    durationMs: 24000,
  },
};

const sourcePhoto = id => ({ id, kind: 'photo', trashed: false, createdAt: '2025-01-01T00:00:00.000Z' });

test('only explicit saved canonical Reels become created-Reel Ready Stories', () => {
  assert.equal(isSavedCanonicalReel(savedReel), true);
  assert.equal(isSavedCanonicalReel({ ...savedReel, trashed: true }), false);
  assert.equal(isSavedCanonicalReel({ ...savedReel, creativeOrigin: { type: 'other' } }), false);

  const stories = buildCreatedReelReadyStoryCandidates({
    media: [savedReel, sourcePhoto('photo-a'), sourcePhoto('photo-b'), { id: 'clip-c', kind: 'video' }],
  });
  assert.equal(stories.length, 1);
  assert.equal(stories[0].type, 'created-reel');
  assert.equal(stories[0].videoMediaId, savedReel.id);
  assert.deepEqual(stories[0].collageMediaIds, ['photo-a', 'photo-b']);
  assert.equal(stories[0].generator, 'ready-story-v2');
  assert.equal(stories[0].approvalRequired, true);
  assert.equal(stories[0].autoPost, false);
});

test('Save to Library remains an explicit post-render action and never happens during preview', () => {
  const page = read('app/(app)/create/reel/page.js');
  const prepare = read('app/api/create/reels/prepare/route.js');
  assert.match(page, /data-testid="create-reel-save-library"/);
  assert.match(page, /\/create\/reels\/render\/\$\{encodeURIComponent\(artifactId\)\}\/save/);
  assert.match(page, /Saving is optional and uses your plan storage/);
  assert.doesNotMatch(prepare, /publishCanonicalReelToLibrary|\/save/);
});

test('Library publication rechecks accounting, deletion generation, storage quota and source storage', () => {
  const service = read('lib/create-reel-library.server.js');
  const route = read('app/api/create/reels/render/[jobId]/save/route.js');
  assert.match(route, /getUserFromRequest/);
  assert.match(route, /userId: user\.id/);
  assert.match(route, /effectivePlan\(user, request\)/);
  assert.match(service, /canonicalRenderAccountingComplete/);
  assert.match(service, /mediaDeletionGenerationIsCurrent/);
  assert.match(service, /resolveStorageScope/);
  assert.match(service, /getStorageScopeUsage/);
  assert.match(service, /reel_library_storage_full/);
  assert.match(service, /storage\.verify/);
});

test('saved Reel is an independent media object with deterministic lineage and no new AI call', () => {
  const service = read('lib/create-reel-library.server.js');
  assert.match(service, /CopyObjectCommand/);
  assert.match(service, /users\/\$\{userId\}\/media\/\$\{mediaId\}\/snapnext-memory-reel\.mp4/);
  assert.match(service, /contentHash/);
  assert.match(service, /sourceMediaIds/);
  assert.match(service, /creativeOrigin/);
  assert.match(service, /canonical-reel-v1/);
  assert.match(service, /aiAnalysisStatus: 'derived_local'/);
  assert.doesNotMatch(service, /runAiTask|generateContent|openai|gemini|reserveProductSpend|reserveCanonicalRenderQuota/i);
});

test('publication is idempotent and does not reuse the render artifact storage key', () => {
  const service = read('lib/create-reel-library.server.js');
  assert.match(service, /canonicalReelLibraryDocumentId/);
  assert.match(service, /\$setOnInsert: mediaDoc/);
  assert.match(service, /alreadySaved: true/);
  assert.match(service, /destinationKey = `users\/\$\{userId\}\/media\/\$\{mediaId\}/);
  assert.doesNotMatch(service, /storageKey:\s*artifact\.storageKey[^\n]*creativeOrigin/);
});

test('Ready Stories query both photos and saved videos and play the real Reel', () => {
  const route = read('app/api/ready-story-drafts/route.js');
  const visuals = read('components/ready-stories/StoryVisuals.js');
  const editor = read('components/ready-stories/ReadyStoryEditor.js');
  const audio = read('components/ready-stories/StoryReelAudio.js');
  assert.match(route, /kind: \{ \$in: \['photo', 'video'\] \}/);
  assert.match(route, /buildCreatedReelReadyStoryCandidates/);
  assert.match(route, /videoMediaId/);
  assert.match(visuals, /data-testid="saved-memory-reel"/);
  assert.match(visuals, /<video/);
  assert.match(visuals, /Unmute saved Memory Reel/);
  assert.match(editor, /data-testid="ready-story-saved-reel"/);
  assert.match(editor, /snapnext-memory-reel\.mp4/);
  assert.match(audio, /story\?\.videoMediaId \? null : soundtrackForStory/);
});

test('saved Reel can be shared only by explicit Trusted Circle choice and shared video has an authorized delivery path', () => {
  const page = read('app/(app)/create/reel/page.js');
  const sharedMedia = read('app/api/shared/media/[id]/route.js');
  const trusted = read('app/(app)/trusted-circle/page.js');
  assert.match(page, /data-testid="create-reel-share-trusted"/);
  assert.match(page, /apiFetch\('\/shared\/memories'/);
  assert.match(page, /Nothing is shared until you choose a person/);
  assert.doesNotMatch(page, /useEffect\([^)]*shareSavedReel/s);
  assert.match(sharedMedia, /canViewOwnersResource/);
  assert.match(sharedMedia, /shareMemories/);
  assert.match(sharedMedia, /shareSharedPhotos/);
  assert.match(trusted, /data-testid=\{`trusted-shared-video-\$\{media\.id\}`\}/);
  assert.match(trusted, /sharedMediaSrc\(media\.id\)/);
});
