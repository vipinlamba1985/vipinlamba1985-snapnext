import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('media URLs do not embed the SnapNext access token', async () => {
  const client = await source('lib/api-client.js');
  assert.match(client, /return `\/api\/media\/\$\{encodeURIComponent\(id\)\}\/file`/);
  assert.doesNotMatch(client, /\/file\?t=/);
});

test('People thumbnails do not embed the SnapNext access token', async () => {
  const thumbnail = await source('components/magic-library/PeopleFaceThumbnail.js');
  assert.doesNotMatch(thumbnail, /thumbnail\?t=/);
  assert.doesNotMatch(thumbnail, /getToken/);
});

test('ZIP downloads use the authenticated same-site route without URL tokens', async () => {
  const downloads = await source('app/(app)/downloads/page.js');
  assert.match(downloads, /\/api\/exports\/\$\{encodeURIComponent\(job\.id\)\}\/download/);
  assert.doesNotMatch(downloads, /download\?t=/);
  assert.doesNotMatch(downloads, /getToken/);
});

test('dedicated media delivery route scopes the file to the authenticated user', async () => {
  const route = await source('app/api/media/[id]/file/route.js');
  assert.match(route, /getUserFromRequest\(request\)/);
  assert.match(route, /findOne\(\{ id: mediaId, userId: user\.id \}\)/);
  assert.doesNotMatch(route, /searchParams\.get\(['"]t['"]\)/);
});

test('dedicated export delivery route scopes the ZIP to the authenticated user', async () => {
  const route = await source('app/api/exports/[id]/download/route.js');
  assert.match(route, /getUserFromRequest\(request\)/);
  assert.match(route, /userId: user\.id/);
  assert.doesNotMatch(route, /searchParams\.get\(['"]t['"]\)/);
});
