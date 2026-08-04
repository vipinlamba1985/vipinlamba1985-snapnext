// drive.file permits creating and modifying the files an app can reach, and
// Google offers no per-file read-only scope. So "SnapNext never writes to your
// Drive" is a promise made by this code, not by the authorisation — and a
// promise made in code has to be enforced somewhere.
//
// The general client exports fetchDriveJson(url, token), which fetches whatever
// URL it is handed. The import path must not have that: it gets two operations,
// both GET, both against one validated file id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertDriveFileId } from '../lib/smart-sync/google-drive-read-only.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(repoRoot, file), 'utf8');
const ADAPTER = path.join('lib', 'smart-sync', 'google-drive-read-only.js');
const IMPORTER = path.join('lib', 'smart-sync', 'google-drive-importer.js');

test('the adapter exposes only reads', async () => {
  const source = await read(ADAPTER);
  const exported = [...source.matchAll(/export (?:async )?function (\w+)/g)].map(match => match[1]);

  assert.deepEqual(exported.sort(), ['assertDriveFileId', 'readDriveContent', 'readDriveMetadata']);
  for (const name of exported) {
    assert.doesNotMatch(name, /create|update|delete|write|upload|copy|trash|permission/i);
  }
});

test('every request the adapter makes is a GET', async () => {
  const source = await read(ADAPTER);
  const methods = [...source.matchAll(/method: '(\w+)'/g)].map(match => match[1]);
  assert.ok(methods.length >= 2, 'expected the requests to state their method');
  assert.deepEqual([...new Set(methods)], ['GET']);
});

test('the adapter cannot be pointed at an arbitrary URL', async () => {
  const source = await read(ADAPTER);
  // A helper taking a url parameter is what lets a write endpoint be reached
  // through an innocent-looking call.
  assert.doesNotMatch(source, /export (?:async )?function \w+\([^)]*\burl\b/);
  assert.doesNotMatch(source, /upload\/drive/, 'the upload host must never appear here');
  // One base, built in this module only.
  assert.equal((source.match(/https:\/\/www\.googleapis\.com/g) || []).length, 1);
});

test('a file id is validated, not trusted', () => {
  assert.equal(assertDriveFileId('1AbC_-xyz'), '1AbC_-xyz');
  for (const bad of ['', null, '../../etc', 'a/b', 'a?alt=media', 'a b', 'x'.repeat(257)]) {
    assert.throws(() => assertDriveFileId(bad), /not valid/, `${JSON.stringify(bad)} should be refused`);
  }
});

test('the import path uses the narrow adapter, not the general client', async () => {
  const importer = await read(IMPORTER);
  assert.match(importer, /google-drive-read-only/);
  assert.doesNotMatch(importer, /google-drive-api/, 'the general Drive client must not reach the import path');
  assert.doesNotMatch(importer, /fetchDriveJson/);
});

test('the general client keeps its arbitrary-URL helper away from imports', async () => {
  // It is still fine for the sync worker, which builds its own queries — the
  // point is that the import path can no longer reach it.
  const general = await read(path.join('lib', 'smart-sync', 'google-drive-api.js'));
  assert.match(general, /export async function fetchDriveJson/);
  const importer = await read(IMPORTER);
  assert.doesNotMatch(importer, /fetchDriveJson/);
});
