import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function runStorageCheck({ storageProvider, nodeEnv = 'production', vercelEnv = '', requireDurableS3 = '' }) {
  return spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import { storage } from './lib/storage.js'; try { storage.validateBeforeSave({ size: 1 }); console.log('allowed'); } catch (error) { console.log(error.code || error.message); process.exitCode = 2; }",
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: nodeEnv, VERCEL_ENV: vercelEnv, REQUIRE_DURABLE_S3: requireDurableS3, STORAGE_PROVIDER: storageProvider },
  });
}

test('Vercel production refuses local storage operations', () => {
  const result = runStorageCheck({ storageProvider: 'local', vercelEnv: 'production' });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /production_storage_requires_s3/);
});

test('Vercel production allows the S3 provider before the first network operation', () => {
  const result = runStorageCheck({ storageProvider: 's3', vercelEnv: 'production' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /allowed/);
});

test('Docker production can use its documented persistent local volume', () => {
  const result = runStorageCheck({ storageProvider: 'local', nodeEnv: 'production', vercelEnv: '' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /allowed/);
});

test('other ephemeral hosts can explicitly require durable S3', () => {
  const result = runStorageCheck({ storageProvider: 'local', nodeEnv: 'production', requireDurableS3: 'true' });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /production_storage_requires_s3/);
});
