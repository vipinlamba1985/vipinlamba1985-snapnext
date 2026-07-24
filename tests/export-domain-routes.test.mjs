import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('export collection route authenticates before listing or creating jobs', async () => {
  const route = await source('app/api/exports/route.js');
  assert.match(route, /getUserFromRequest\(request\)/);
  assert.match(route, /find\(\{ userId: user\.id \}\)/);
  assert.match(route, /createJob\(\{ userId: user\.id/);
});

test('selected exports only include media owned by the authenticated user', async () => {
  const route = await source('app/api/exports/route.js');
  assert.match(route, /id: \{ \$in: ids \}, userId: user\.id/);
  assert.match(route, /No owned media in selection/);
});

test('export status and retry routes scope jobs to the authenticated user', async () => {
  const statusRoute = await source('app/api/exports/[id]/route.js');
  const retryRoute = await source('app/api/exports/[id]/retry/route.js');
  assert.match(statusRoute, /userId: user\.id/);
  assert.match(retryRoute, /userId: user\.id/);
  assert.match(retryRoute, /Only failed or expired jobs can be retried/);
});

test('export download route never authenticates from a query parameter', async () => {
  const route = await source('app/api/exports/[id]/download/route.js');
  assert.match(route, /getUserFromRequest\(request\)/);
  assert.doesNotMatch(route, /searchParams\.get\(['"]t['"]\)/);
});
