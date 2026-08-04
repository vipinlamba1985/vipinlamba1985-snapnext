// The Picker is selection UI. Its name, mimeType and sizeBytes come through
// the browser and are not evidence — Drive's own metadata is, and even that is
// only a claim about the moment it was read. These tests pin what the server
// will accept and what it counts for itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_IMPORT_BYTES,
  REJECTION,
  inspectDriveMetadata,
  isImportableMime,
  parseDriveSize,
  verifyDownloadedBytes,
} from '../lib/smart-sync/drive-import-policy.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const photo = (over = {}) => ({ mimeType: 'image/jpeg', size: '1024', capabilities: { canDownload: true }, ...over });

test('a photo with a real size is accepted', () => {
  const verdict = inspectDriveMetadata(photo());
  assert.equal(verdict.ok, true);
  assert.equal(verdict.size, 1024);
});

test('Google Workspace documents are refused, not exported', () => {
  // Docs, Sheets and Slides have no bytes to download and are not memories.
  for (const mime of [
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.folder',
    'application/vnd.google-apps.shortcut',
  ]) {
    const verdict = inspectDriveMetadata(photo({ mimeType: mime }));
    assert.equal(verdict.ok, false, `${mime} must be refused`);
    assert.equal(verdict.reason, REJECTION.UNSUPPORTED_TYPE);
  }
});

test('only photos and videos are importable', () => {
  assert.equal(isImportableMime('image/heic'), true);
  assert.equal(isImportableMime('video/quicktime'), true);
  assert.equal(isImportableMime('application/pdf'), false);
  assert.equal(isImportableMime(''), false);
  assert.equal(isImportableMime(null), false);
});

test('a file Drive will not let us download is refused before we try', () => {
  const verdict = inspectDriveMetadata(photo({ capabilities: { canDownload: false } }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, REJECTION.NOT_DOWNLOADABLE);
});

test('a trashed file is refused first, before anything is weighed', () => {
  const verdict = inspectDriveMetadata(photo({ trashed: true }));
  assert.equal(verdict.reason, REJECTION.TRASHED);
});

test('a missing size is a refusal, not a zero', () => {
  // Drive omits size for anything that is not a stored blob. Treating that as
  // zero would let an item with no bytes pass every later check.
  for (const size of [undefined, null, '', 'abc', '0', '-5', '1.5']) {
    const verdict = inspectDriveMetadata(photo({ size }));
    assert.equal(verdict.ok, false, `size ${JSON.stringify(size)} must be refused`);
  }
  assert.equal(parseDriveSize('9007199254740993'), null, 'beyond safe integers is not a size');
});

test('an oversized file is refused on metadata alone', () => {
  const verdict = inspectDriveMetadata(photo({ size: String(MAX_IMPORT_BYTES + 1) }));
  assert.equal(verdict.reason, REJECTION.TOO_LARGE);
});

test('what arrived decides, not what was promised', () => {
  assert.equal(verifyDownloadedBytes({ expectedSize: 100, actualSize: 100 }).ok, true);
  // A file can change between the metadata read and the download.
  assert.equal(verifyDownloadedBytes({ expectedSize: 100, actualSize: 900 }).reason, 'size_mismatch');
  assert.equal(verifyDownloadedBytes({ expectedSize: 100, actualSize: 0 }).reason, REJECTION.UNKNOWN_SIZE);
  assert.equal(verifyDownloadedBytes({ expectedSize: 5, actualSize: MAX_IMPORT_BYTES + 1 }).reason, REJECTION.TOO_LARGE);
});

test('a stream that would exceed remaining quota is refused', () => {
  assert.equal(verifyDownloadedBytes({ expectedSize: 500, actualSize: 500, remainingQuota: 400 }).reason, 'capacity');
  assert.equal(verifyDownloadedBytes({ expectedSize: 500, actualSize: 500, remainingQuota: 500 }).ok, true);
  // No quota means unlimited, not zero.
  assert.equal(verifyDownloadedBytes({ expectedSize: 500, actualSize: 500, remainingQuota: null }).ok, true);
});

test('the importer judges fresh metadata rather than a cached record', async () => {
  const importer = await readFile(path.join(repoRoot, 'lib', 'smart-sync', 'google-drive-importer.js'), 'utf8');
  assert.match(importer, /inspectDriveMetadata\(meta\)/);
  assert.match(importer, /verifyDownloadedBytes/);
  // Metadata is read every time, not only when the cache is cold.
  assert.doesNotMatch(importer, /if \(!asset \|\| !asset\.mime\)/);
  // The resource key reaches both calls, or link-shared files fail.
  assert.match(importer, /readDriveMetadata\(token, driveId, resourceKey\)/);
  assert.match(importer, /readDriveContent\(token, driveId, resourceKey\)/);
});

test('both halves of the resource-key header are validated', async () => {
  const { driveResourceHeaders } = await import('../lib/smart-sync/google-drive-read-only.js');
  // The header uses "/" between a pair and "," between pairs, so neither half
  // may contain either.
  assert.throws(() => driveResourceHeaders('a/b', 'k'), /not valid/);
  assert.throws(() => driveResourceHeaders('a,b', 'k'), /not valid/);
  assert.throws(() => driveResourceHeaders('abc', 'a/b'), /not valid/);
  assert.throws(() => driveResourceHeaders('abc', 'a,b'), /not valid/);
  assert.deepEqual(driveResourceHeaders('abc', 'k1'), { 'X-Goog-Drive-Resource-Keys': 'abc/k1' });
});

test('content is identified by its bytes, not by what it claims to be', async () => {
  const { detectMediaSignature, verifyDownloadedContent } = await import('../lib/smart-sync/drive-import-policy.js');

  assert.equal(detectMediaSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(detectMediaSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), 'image/png');

  // HTML dressed as a photo must not become a stored memory.
  const html = Buffer.from('<!doctype html><html><body>hi</body></html>');
  assert.equal(detectMediaSignature(html), null);
  assert.equal(verifyDownloadedContent({ bytes: html }).reason, 'unrecognised_content');

  // Too short to identify is a refusal, not a pass.
  assert.equal(detectMediaSignature(Buffer.from([0xff, 0xd8])), null);
});

test('the ISO container is split into image and video by brand', async () => {
  const { detectMediaSignature } = await import('../lib/smart-sync/drive-import-policy.js');
  const iso = brand => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from(brand)]);
  assert.equal(detectMediaSignature(iso('heic')), 'image/heic');
  assert.equal(detectMediaSignature(iso('qt  ')), 'video/quicktime');
  assert.equal(detectMediaSignature(iso('isom')), 'video/mp4');
});

test("Google's checksum is compared when it supplies one", async () => {
  const { verifyDownloadedContent } = await import('../lib/smart-sync/drive-import-policy.js');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

  // A same-length replacement between metadata and download is exactly what a
  // byte count cannot catch.
  assert.equal(verifyDownloadedContent({ bytes: jpeg, expectedMd5: 'aaa', actualMd5: 'bbb' }).reason, 'checksum_mismatch');
  assert.equal(verifyDownloadedContent({ bytes: jpeg, expectedMd5: 'ABC', actualMd5: 'abc' }).ok, true, 'case must not matter');
  // Absent is normal for some items and must not block them.
  assert.equal(verifyDownloadedContent({ bytes: jpeg, expectedMd5: null, actualMd5: null }).ok, true);
});

test('the importer checks content before storing, not after', async () => {
  const importer = await readFile(path.join(repoRoot, 'lib', 'smart-sync', 'google-drive-importer.js'), 'utf8');
  assert.match(importer, /verifyDownloadedContent/);
  assert.match(importer, /createHash\('md5'\)/);
  // Content verification must precede the storage write.
  assert.ok(importer.indexOf('verifyDownloadedContent') < importer.indexOf('storage.save'));
});
