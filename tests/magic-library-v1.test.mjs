import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  MAGIC_CARD_TYPES,
  buildMagicCards,
  buildMagicCoveragePipeline,
  cardSortTime,
  compareCardAssets,
  filterManifestForDelivery,
  isDeterministicScreenshot,
  strictCaptureTime,
} from '../lib/magic-manifest.js';
import {
  faceCardsAllowedForState,
  magicManifestConfig,
} from '../lib/magic-manifest.server.js';
import { CLOUD_FACE_RECOGNITION_CONSENT_VERSION } from '../lib/intelligence/config.js';

function item(id, patch = {}) {
  return {
    id,
    kind: 'photo',
    trashed: false,
    magic_eligible: true,
    ...patch,
  };
}

function faceUser(patch = {}) {
  return {
    cloudFaceRecognitionConsent: {
      granted: true,
      version: CLOUD_FACE_RECOGNITION_CONSENT_VERSION,
      grantedAt: new Date('2026-08-01T00:00:00.000Z'),
      revokedAt: null,
      deletionState: 'none',
      ...patch,
    },
  };
}

function syntheticFaceManifest(overrides = {}) {
  return {
    manifest_id: 'manifest-1',
    user_id: 'user-1',
    blueprint_version: 'magic-v1',
    generated_at: new Date('2026-08-18T00:00:00.000Z'),
    cards: [{
      card_id: 'face:test',
      card_key: 'face:test',
      tier: 'T2',
      type: MAGIC_CARD_TYPES.FACE_CLUSTER,
      title: 'Confirmed person',
      asset_ids: ['a'],
      cover_asset_id: 'a',
      requires_face_consent: true,
      expires_at: new Date('2026-08-20T00:00:00.000Z'),
      min_assets: 1,
      ...overrides,
    }],
  };
}

test('Favorites and Videos use capture time, then uploadedAt, then id ASC', () => {
  const rows = [
    item('c', { uploadedAt: '2026-08-10T00:00:00Z' }),
    item('b', { capturedAt: '2026-08-09T00:00:00Z', uploadedAt: '2026-08-18T00:00:00Z' }),
    item('a', { capturedAt: '2026-08-09T00:00:00Z', uploadedAt: '2026-08-01T00:00:00Z' }),
  ].sort(compareCardAssets);

  assert.deepEqual(rows.map(row => row.id), ['c', 'a', 'b']);
  assert.equal(cardSortTime(rows[0]), new Date('2026-08-10T00:00:00Z').getTime());
});

test('strict capture time never falls back to upload or created dates', () => {
  assert.equal(strictCaptureTime(item('a', { uploadedAt: '2026-08-18T00:00:00Z', createdAt: '2026-08-18T00:00:00Z' })), null);
  assert.equal(strictCaptureTime(item('b', { takenAt: '2024-04-05T00:00:00Z' })), new Date('2024-04-05T00:00:00Z').getTime());
});

test('Magic V1 emits deterministic T1 cards and never emits Recently added', () => {
  const base = Array.from({ length: 6 }, (_, index) => item(`p-${index}`, {
    capturedAt: `2026-08-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
    favorite: true,
  }));
  const videos = Array.from({ length: 6 }, (_, index) => item(`v-${index}`, {
    kind: 'video',
    uploadedAt: `2026-07-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
    favorite: true,
  }));

  const first = buildMagicCards([...base, ...videos], { minAssets: 5 });
  const second = buildMagicCards([...base, ...videos].reverse(), { minAssets: 5 });

  assert.deepEqual(first, second);
  assert.ok(first.some(card => card.type === MAGIC_CARD_TYPES.TIME_PERIOD));
  assert.ok(first.some(card => card.type === MAGIC_CARD_TYPES.FAVORITES));
  assert.ok(first.some(card => card.type === MAGIC_CARD_TYPES.VIDEOS));
  assert.equal(first.some(card => card.type === MAGIC_CARD_TYPES.RECENTLY_ADDED), false);
});

test('time cards require the configured asset floor and trustworthy capture dates', () => {
  const fourCaptured = Array.from({ length: 4 }, (_, index) => item(`capture-${index}`, {
    capturedAt: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  }));
  const uploadOnly = item('upload-only', { uploadedAt: '2026-08-05T00:00:00Z' });
  const cards = buildMagicCards([...fourCaptured, uploadOnly], { minAssets: 5 });
  assert.equal(cards.some(card => card.type === MAGIC_CARD_TYPES.TIME_PERIOD), false);
});

test('global cover budget prevents the same hero from fronting Favorites and Videos', () => {
  const rows = Array.from({ length: 6 }, (_, index) => item(`v-${index}`, {
    kind: 'video',
    favorite: true,
    uploadedAt: `2026-08-${String(10 - index).padStart(2, '0')}T00:00:00Z`,
  }));
  const cards = buildMagicCards(rows, { minAssets: 5 });
  const favorites = cards.find(card => card.type === MAGIC_CARD_TYPES.FAVORITES);
  const videos = cards.find(card => card.type === MAGIC_CARD_TYPES.VIDEOS);
  assert.ok(favorites);
  assert.ok(videos);
  assert.notEqual(favorites.cover_asset_id, videos.cover_asset_id);
});

test('no manifest is a normal HTTP-contract starter state', () => {
  const delivery = filterManifestForDelivery({ manifest: null, minMagicCards: 3 });
  assert.equal(delivery.availability, 'starter');
  assert.equal(delivery.reason, 'manifest_pending');
  assert.deepEqual(delivery.cards, []);
});

test('T1 staleness is harmless but expired T2 is suppressed', () => {
  const now = new Date('2026-08-18T12:00:00Z');
  const base = {
    manifest_id: 'm',
    user_id: 'u',
    blueprint_version: 'magic-v1',
    cards: [
      {
        card_id: 't1', card_key: 't1', tier: 'T1', type: 'videos', asset_ids: ['a'], cover_asset_id: 'a',
        requires_face_consent: false, expires_at: '2026-08-17T00:00:00Z', min_assets: 1,
      },
      {
        card_id: 't2', card_key: 't2', tier: 'T2', type: 'face_cluster', asset_ids: ['b'], cover_asset_id: 'b',
        requires_face_consent: false, expires_at: '2026-08-17T00:00:00Z', min_assets: 1,
      },
    ],
  };
  const delivery = filterManifestForDelivery({
    manifest: base,
    existingAssetIds: new Set(['a', 'b']),
    faceCardsAllowed: true,
    now,
    minMagicCards: 1,
  });
  assert.deepEqual(delivery.cards.map(card => card.card_id), ['t1']);
});

test('missing cover suppresses a card; missing member drops it and rechecks minimum', () => {
  const manifest = {
    manifest_id: 'm', user_id: 'u', blueprint_version: 'magic-v1',
    cards: [
      { card_id: 'cover-gone', tier: 'T1', asset_ids: ['a', 'b'], cover_asset_id: 'a', min_assets: 1 },
      { card_id: 'member-gone', tier: 'T1', asset_ids: ['c', 'd'], cover_asset_id: 'c', min_assets: 1 },
      { card_id: 'falls-below', tier: 'T1', asset_ids: ['e', 'f'], cover_asset_id: 'e', min_assets: 2 },
    ],
  };
  const delivery = filterManifestForDelivery({
    manifest,
    existingAssetIds: new Set(['c', 'e']),
    minMagicCards: 1,
  });
  assert.deepEqual(delivery.cards.map(card => card.card_id), ['member-gone']);
  assert.deepEqual(delivery.cards[0].asset_ids, ['c']);
});

test('synthetic T2 card is suppressed for consent-off and every deletion-blocking M7 state', () => {
  const manifest = syntheticFaceManifest();
  const assetIds = new Set(['a']);
  const now = new Date('2026-08-18T12:00:00Z');

  const states = [
    { user: faceUser({ granted: false }), deletion: null },
    { user: faceUser({ granted: false, revokedAt: new Date('2026-08-10T00:00:00Z') }), deletion: null },
    ...['pending', 'processing', 'verifying', 'failed'].map(status => ({ user: faceUser(), deletion: { status } })),
    {
      user: faceUser({ grantedAt: new Date('2026-08-01T00:00:00Z') }),
      deletion: { status: 'verified_deleted', verifiedAt: new Date('2026-08-10T00:00:00Z') },
    },
  ];

  for (const state of states) {
    const allowed = faceCardsAllowedForState(state.user, state.deletion);
    assert.equal(allowed, false);
    const delivery = filterManifestForDelivery({ manifest, existingAssetIds: assetIds, faceCardsAllowed: allowed, now, minMagicCards: 1 });
    assert.equal(delivery.cards.length, 0);
  }
});

test('fresh explicit consent after verified deletion may enable future T2 cards', () => {
  const allowed = faceCardsAllowedForState(
    faceUser({ grantedAt: new Date('2026-08-15T00:00:00Z') }),
    { status: 'verified_deleted', verifiedAt: new Date('2026-08-10T00:00:00Z') },
  );
  assert.equal(allowed, true);
});

test('Screenshots V1 uses deterministic provenance and ignores AI-only classification', () => {
  assert.equal(isDeterministicScreenshot(item('a', { name: 'Screenshot 2026-08-18.png' })), true);
  assert.equal(isDeterministicScreenshot(item('b', { userCategory: 'screenshots', name: 'IMG_1234.PNG' })), true);
  assert.equal(isDeterministicScreenshot(item('c', { name: 'IMG_1234.PNG', aiAnalysis: { contentType: 'screenshot' } })), false);
});

test('coverage aggregation measures capture and deterministic screenshot gates together', () => {
  const source = JSON.stringify(buildMagicCoveragePipeline());
  assert.match(source, /capturedAt/);
  assert.match(source, /takenAt/);
  assert.match(source, /mediaCreatedAt/);
  assert.match(source, /deterministicScreenshotMatches/);
});

test('MIN_MAGIC_CARDS is configuration, not a hard-coded branch', () => {
  assert.equal(magicManifestConfig({ MIN_MAGIC_CARDS: '2' }).minMagicCards, 2);
  assert.equal(magicManifestConfig({}).minMagicCards, 3);
});

test('manifest GET enforces private no-store and Magic V1 contains no face UI bootstrap', async () => {
  const manifestRoute = await readFile(new URL('../app/api/magic-library/manifest/route.js', import.meta.url), 'utf8');
  const magicPage = await readFile(new URL('../app/(app)/gallery/magic/page.js', import.meta.url), 'utf8');
  assert.match(manifestRoute, /private, no-store/);
  assert.doesNotMatch(magicPage, /PeopleFaceConsent|PeopleMagicBootstrap|PeopleLocalAnalysisBackfill|MagicLibraryGalleryMagic/);
});

test('Library hides the global Ask launcher but keeps it elsewhere', async () => {
  const launcher = await readFile(new URL('../components/AskSnapNextLauncher.js', import.meta.url), 'utf8');
  assert.match(launcher, /pathname === '\/gallery'/);
  assert.match(launcher, /pathname\.startsWith\('\/gallery\/'\)/);
  assert.match(launcher, /href="\/chat"/);
});
