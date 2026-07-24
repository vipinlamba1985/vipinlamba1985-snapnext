import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseDownloadLogRequest,
  parseNotificationReadRequest,
} from '../lib/notifications-downloads-contract.js';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('notification read request de-duplicates bounded ids and supports mark-all', () => {
  assert.deepEqual(parseNotificationReadRequest({}), { ids: null });
  assert.deepEqual(parseNotificationReadRequest({ ids: ['a', 'a', ' b '] }), { ids: ['a', 'b'] });
  assert.throws(() => parseNotificationReadRequest({ ids: 'a' }), /Invalid notification IDs/);
});

test('download log request requires media ids and de-duplicates them', () => {
  assert.deepEqual(parseDownloadLogRequest({ mediaIds: ['m1', 'm1', 'm2'] }), { mediaIds: ['m1', 'm2'] });
  assert.throws(() => parseDownloadLogRequest({ mediaIds: [] }), /Choose at least one media item/);
});

test('notification list and read routes remain authenticated and user-scoped', async () => {
  const listRoute = await source('app/api/notifications/route.js');
  const readRoute = await source('app/api/notifications/read/route.js');
  assert.match(listRoute, /getUserFromRequest\(request\)/);
  assert.match(listRoute, /find\(\{ userId: user\.id \}\)/);
  assert.match(readRoute, /const filter = \{ userId: user\.id \}/);
  assert.match(readRoute, /readAt: new Date\(\)/);
});

test('download log route records only active media owned by the authenticated user', async () => {
  const route = await source('app/api/downloads/log/route.js');
  assert.match(route, /userId: user\.id, trashed: \{ \$ne: true \}/);
  assert.match(route, /No owned media in download selection/);
  assert.match(route, /mediaIds: ownedIds/);
});
