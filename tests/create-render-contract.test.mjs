import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATE_MANIFEST_VERSION,
  CREATE_RENDER_CONTRACT_VERSION,
  CREATE_RENDERER_OUTPUT_VERSION,
  canonicalizeCreateManifest,
  createManifestHash,
  renderArtifactDocumentId,
  renderArtifactStorageKey,
  validateCanonicalCreateManifest,
} from '../lib/create-render-contract.js';

function baseManifest() {
  return {
    manifestVersion: CREATE_MANIFEST_VERSION,
    renderContractVersion: CREATE_RENDER_CONTRACT_VERSION,
    rendererOutputVersion: CREATE_RENDERER_OUTPUT_VERSION,
    aspectRatio: '9:16',
    scenes: [
      {
        kind: 'photo',
        sourceMediaId: 'p1',
        contentHash: 'aaaaaaaa',
        durationMs: 3200,
        crop: { mode: 'cover', focalX: 0.4, focalY: 0.6, zoom: 1.1 },
        textLayers: [{ id: 'caption', text: 'Summer night', x: 0.5, y: 0.8, width: 0.8 }],
        transition: { type: 'crossfade', durationMs: 350 },
      },
      {
        kind: 'video',
        sourceMediaId: 'v1',
        contentHash: 'bbbbbbbb',
        durationMs: 2800,
        videoInMs: 1000,
        videoOutMs: 3800,
        crop: { focalX: 0.5, focalY: 0.5 },
      },
    ],
    music: {
      trackId: 'track-1',
      contentHash: 'cccccccc',
      offsetMs: 250,
      trimInMs: 100,
      volume: 0.28,
      licenseSnapshot: 'Wikimedia Commons:CC0-1.0:track-1',
    },
  };
}

test('canonical Create manifest hash is stable across object key ordering', () => {
  const manifest = baseManifest();
  const reordered = {
    music: { ...manifest.music },
    scenes: manifest.scenes.map(scene => Object.fromEntries(Object.entries(scene).reverse())),
    aspectRatio: manifest.aspectRatio,
    rendererOutputVersion: manifest.rendererOutputVersion,
    renderContractVersion: manifest.renderContractVersion,
    manifestVersion: manifest.manifestVersion,
  };
  assert.equal(createManifestHash(manifest), createManifestHash(reordered));
});

test('canonical user decisions change the artifact hash', () => {
  const manifest = baseManifest();
  const original = createManifestHash(manifest);
  const variants = [
    { ...manifest, aspectRatio: '1:1' },
    { ...manifest, scenes: [...manifest.scenes].reverse() },
    { ...manifest, scenes: manifest.scenes.map((scene, index) => index === 0 ? { ...scene, durationMs: 3600 } : scene) },
    { ...manifest, scenes: manifest.scenes.map((scene, index) => index === 0 ? { ...scene, crop: { ...scene.crop, focalX: 0.2 } } : scene) },
    { ...manifest, scenes: manifest.scenes.map((scene, index) => index === 0 ? { ...scene, textLayers: [{ ...scene.textLayers[0], text: 'Changed caption' }] } : scene) },
    { ...manifest, music: { ...manifest.music, offsetMs: 900 } },
    { ...manifest, rendererOutputVersion: manifest.rendererOutputVersion + 1 },
  ];
  for (const variant of variants) assert.notEqual(createManifestHash(variant), original);
});

test('total duration is derived from canonical scenes', () => {
  const canonical = canonicalizeCreateManifest(baseManifest());
  assert.equal(canonical.totalDurationMs, 6000);
  assert.equal(canonical.scenes[0].index, 0);
  assert.equal(canonical.scenes[1].index, 1);
});

test('source content hashes are mandatory for export', () => {
  const manifest = baseManifest();
  manifest.scenes[0] = { ...manifest.scenes[0], contentHash: '' };
  const validation = validateCanonicalCreateManifest(manifest);
  assert.equal(validation.ok, false);
  assert.equal(validation.code, 'create_manifest_source_hash_missing');
  assert.throws(() => createManifestHash(manifest), { code: 'create_manifest_source_hash_missing' });
});

test('render artifact identity stays user-scoped while storage is manifest-keyed', () => {
  const hash = createManifestHash(baseManifest());
  assert.notEqual(renderArtifactDocumentId('user-a', hash), renderArtifactDocumentId('user-b', hash));
  assert.match(renderArtifactStorageKey('user-a', hash), new RegExp(`${hash}\\.mp4$`));
});
