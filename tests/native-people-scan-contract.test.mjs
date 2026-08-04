// Contracts for a native capability that does not exist yet.
//
// The risk these guard against is a specific one: contracts like this tend to
// grow a "temporary" mock success so UI can be demoed, and then ship. A user
// would be offered face scanning the device cannot do. So the capability must
// stay honestly unsupported until a real plugin replaces it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PHOTO_ACCESS_STATES,
  SCAN_PHASES,
  SCAN_UNSUPPORTED_REASONS,
  canOfferPeopleScan,
  nativePeopleScanCapability,
} from '../lib/native/people-scan-contract.js';
import { buildNativeUploadPlan, validateNativeManifest } from '../lib/smart-sync/native-bridge.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');

test('people scanning reports itself unsupported, with a reason', () => {
  const capability = nativePeopleScanCapability();
  assert.equal(capability.supported, false);
  assert.equal(capability.reason, 'native_plugin_missing');
  assert.ok(SCAN_UNSUPPORTED_REASONS.includes(capability.reason));
  assert.equal(canOfferPeopleScan(), false);
});

test('the contract carries no implementation and no mock success', async () => {
  const raw = await read(path.join('lib', 'native', 'people-scan-contract.js'));
  // Typedefs legitimately describe the supported shape, so only executable code
  // is checked. A mocked "supported: true" there is how a contract like this
  // ships a promise the device cannot keep.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(source, /supported: true/);
  assert.doesNotMatch(source, /fetch\(|createHash|require\(/);
  // No scanning, detection or clustering may live here.
  assert.doesNotMatch(source, /function (detect|cluster|embed|enumerate)\w*\(/i);
});

test('nothing in the app offers people scanning yet', async () => {
  const shell = await read(path.join('components', 'AppShell.js'));
  const discovery = await read(path.join('app', '(app)', 'upload', 'discover', 'DiscoveryFlow.js'));
  for (const [name, source] of [['nav', shell], ['add screen', discovery]]) {
    assert.doesNotMatch(source, /People Scan|Find Favourite People|face scan/i, `${name} must not advertise scanning`);
  }
});

test('an asset with no confirmed people is still a valid import', () => {
  // Manual selection, favourites, albums and date ranges must all work without
  // any face analysis having happened.
  const manifest = validateNativeManifest({
    provider: 'ios_photos',
    assets: [{ localId: 'a1', kind: 'photo', filename: 'a.jpg', size: 100 }],
  });
  assert.deepEqual(manifest.assets[0].confirmedPersonIds, []);

  const plan = buildNativeUploadPlan({
    profile: { rules: [{ type: 'everything', priority: 1 }] },
    manifest,
    remainingBytes: 10_000,
  });
  assert.equal(plan.selected.length, 1, 'no people data must not block an everything import');
});

test('favourite-people filtering only matches confirmed local ids', () => {
  const manifest = validateNativeManifest({
    provider: 'ios_photos',
    assets: [
      { localId: 'with', kind: 'photo', filename: 'w.jpg', size: 100, confirmedPersonIds: ['local_person_7fb3'] },
      { localId: 'without', kind: 'photo', filename: 'x.jpg', size: 100 },
      { localId: 'other', kind: 'photo', filename: 'y.jpg', size: 100, confirmedPersonIds: ['local_person_zzzz'] },
    ],
  });

  const plan = buildNativeUploadPlan({
    profile: { rules: [{ type: 'favorite_people', priority: 1, targetIds: ['local_person_7fb3'] }] },
    manifest,
    remainingBytes: 10_000,
  });

  const chosen = plan.selected.map(entry => entry.localId || entry.asset?.localId);
  assert.deepEqual(chosen, ['with'], 'only the confirmed person may match');
});

test('person ids are treated as opaque data, never as identity', () => {
  // The server must not read meaning into them, and must bound them.
  const manifest = validateNativeManifest({
    provider: 'android_media',
    assets: [{
      localId: 'a', kind: 'photo', filename: 'a.jpg', size: 1,
      confirmedPersonIds: Array.from({ length: 200 }, (_, i) => `p${i}`),
    }],
  });
  assert.ok(manifest.assets[0].confirmedPersonIds.length <= 50, 'the list must stay bounded');
  assert.ok(manifest.assets[0].confirmedPersonIds.every(id => typeof id === 'string'));
});

test('the documentation no longer claims a platform supplies face groups', async () => {
  const status = await read(path.join('docs', 'CLOUD_SYNC_STATUS.md'));
  assert.doesNotMatch(status, /maps to platform face grouping/);
  assert.match(status, /SnapNext-generated local identifiers/);
  assert.match(status, /no face detection, no embedding, no clustering/);
});

test('the architecture decision is recorded', async () => {
  const adr = await read(path.join('docs', 'adr', '0001-native-media-intelligence.md'));
  assert.match(adr, /Capacitor/);
  assert.match(adr, /Retain generated `ios\/` and `android\/` projects/);
  // The correction that prompted the ADR must be preserved, not smoothed over.
  assert.match(adr, /was wrong/);
});
