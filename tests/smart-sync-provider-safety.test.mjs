import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const importer = fs.readFileSync(new URL('../lib/smart-sync/provider-importer.js', import.meta.url), 'utf8');
const oauthRoute = fs.readFileSync(new URL('../app/api/smart-sync/oauth/[provider]/[action]/route.js', import.meta.url), 'utf8');
const jobs = fs.readFileSync(new URL('../lib/smart-sync/jobs.js', import.meta.url), 'utf8');

test('weak OneDrive hashes cannot prove a cross-file duplicate', () => {
  assert.match(importer, /STRONG_PROVIDER_HASHES = new Set\(\['sha256', 'sha1', 'dropbox_content_hash'\]\)/);
  assert.match(importer, /isStrongProviderChecksum\(asset\.providerChecksum\)/);
});

test('disconnect stops provider jobs and clears plan approval', () => {
  assert.match(oauthRoute, /approvedAt: null/);
  assert.match(oauthRoute, /status: 'stopped'/);
  assert.match(oauthRoute, /\$unset: \{ activeKey: '', leaseToken: '', leaseUntil: '' \}/);
});

test('public Smart Sync jobs do not expose Picker session identifiers', () => {
  assert.match(jobs, /pickerSessionId,/);
});
