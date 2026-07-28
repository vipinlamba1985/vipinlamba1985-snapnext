import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSmartSyncProviderRequest,
  upsertProviderRequest,
} from '../lib/smart-sync/provider-request.js';

test('provider requests normalize names, types, and bounded details', () => {
  const request = normalizeSmartSyncProviderRequest({
    providerName: '  Nextcloud   Home  ',
    connectionType: 'webdav',
    details: `  ${'private photos '.repeat(80)}  `,
  });

  assert.equal(request.providerName, 'Nextcloud Home');
  assert.equal(request.providerKey, 'nextcloud-home');
  assert.equal(request.connectionType, 'webdav');
  assert.equal(request.details.length, 400);
});

test('invalid provider requests fail before database work', () => {
  assert.throws(
    () => normalizeSmartSyncProviderRequest({ providerName: ' ' }),
    error => error.code === 'provider_required',
  );
});

test('repeat requests update one account-owned provider entry', () => {
  const first = new Date('2026-07-28T10:00:00.000Z');
  const second = new Date('2026-07-28T11:00:00.000Z');
  const normalized = normalizeSmartSyncProviderRequest({ providerName: 'Box' });
  const initial = upsertProviderRequest([], normalized, first);
  const updated = upsertProviderRequest(initial, { ...normalized, details: 'Need family photo sync.' }, second);

  assert.equal(updated.length, 1);
  assert.equal(updated[0].submitCount, 2);
  assert.equal(updated[0].details, 'Need family photo sync.');
  assert.equal(updated[0].firstRequestedAt, first);
  assert.equal(updated[0].lastRequestedAt, second);
});

test('provider request history is capped to twelve recent entries', () => {
  let requests = [];
  for (let index = 0; index < 15; index += 1) {
    const request = normalizeSmartSyncProviderRequest({ providerName: `Cloud ${index}` });
    requests = upsertProviderRequest(requests, request, new Date(2026, 0, index + 1));
  }

  assert.equal(requests.length, 12);
  assert.equal(requests[0].providerName, 'Cloud 14');
  assert.equal(requests.at(-1).providerName, 'Cloud 3');
});
