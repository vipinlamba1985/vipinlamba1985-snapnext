import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../lib/storage.js', import.meta.url), 'utf8');
const reconcile = fs.readFileSync(new URL('../app/api/cron/storage-reconcile/route.js', import.meta.url), 'utf8');

test('storage writes are verified before success is returned', () => {
  assert.match(source, /await s3\.verify\(\{ storageKey, expectedSize: buffer\.length \}\)/);
  assert.match(source, /await local\.verify\(\{ storageKey, expectedSize: buffer\.length \}\)/);
  assert.match(source, /HeadObjectCommand/);
  assert.match(source, /size mismatch/);
});

test('failed S3 writes attempt cleanup', () => {
  assert.match(source, /catch \(error\) \{\s*try \{ await s3\.delete\(\{ storageKey \}\); \} catch \{\}/s);
});

test('orphan reconciliation is cron-secret protected and grace-period based', () => {
  assert.match(reconcile, /process\.env\.CRON_SECRET/);
  assert.match(reconcile, /STORAGE_ORPHAN_GRACE_MINUTES/);
  assert.match(reconcile, /referenced\.has\(object\.storageKey\)/);
});
