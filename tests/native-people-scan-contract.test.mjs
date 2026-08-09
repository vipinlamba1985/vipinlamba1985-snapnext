import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNativeManifest, buildNativeUploadPlan } from '../lib/smart-sync/native-bridge.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

test('people scanning reports itself unsupported, with a reason', async () => {
  const source = await read(path.join('lib', 'native', 'people-scan-contract.js'));
  assert.match(source, /supported:\s*false/);
  assert.match(source, /reason/);
});

test('the contract carries no implementation and no mock success', async () => {
  const source = await read(path.join('lib', 'native', 'people-scan-contract.js'));
  assert.doesNotMatch(source, /supported:\s*true/);
  assert.doesNotMatch(source, /mock|fake/i);
});

test('nothing in the app offers people scanning yet', async () => {
  const packageJson = await read('package.json');
  assert.doesNotMatch(packageJson, /face[-_ ]?recognition|face[-_ ]?embedding|photo[-_ ]?library/i);
});

test('an asset with no confirmed people is still a valid import', () => {
  const manifest = validateNativeManifest({
    provider: 'ios_photos',
    assets: [{ localId: 'a', kind: 'photo', filename: 'a.jpg', size: 1 }],
  });
  assert.equal(manifest.assets.length, 1);
  assert.deepEqual(manifest.assets[0].confirmedPersonIds, []);
});

test('favourite-people filtering only matches confirmed local ids', () => {
  const manifest = validateNativeManifest({
    provider: 'ios_photos',
    assets: [
      { localId: 'with', kind: 'photo', filename: 'with.jpg', size: 1, confirmedPersonIds: ['local_person_7fb3'] },
      { localId: 'without', kind: 'photo', filename: 'without.jpg', size: 1, confirmedPersonIds: [] },
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

test('documentation keeps native person ids SnapNext-owned rather than platform face groups', async () => {
  const status = await read(path.join('docs', 'CLOUD_SYNC_STATUS.md'));
  const adr = await read(path.join('docs', 'adr', '0001-native-media-intelligence.md'));
  assert.doesNotMatch(status, /maps to platform face grouping/);
  assert.match(adr, /SnapNext-generated local identifiers/);
  assert.match(adr, /This is a map, not a claim that anything exists/);
});

test('the architecture decision is recorded', async () => {
  const adr = await read(path.join('docs', 'adr', '0001-native-media-intelligence.md'));
  assert.match(adr, /Capacitor/);
  assert.match(adr, /Retain generated `ios\/` and `android\/` projects/);
  assert.match(adr, /was wrong/);
});
