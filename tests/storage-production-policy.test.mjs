import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function runStorageCheck(storageProvider) {
  return spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import { storage } from './lib/storage.js'; try { storage.validateBeforeSave({ size: 1 }); console.log('allowed'); } catch (error) { console.log(error.code || error.message); process.exitCode = 2; }",
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production', VERCEL_ENV: 'production', STORAGE_PROVIDER: storageProvider },
  });
}

test('production refuses local storage operations', () => {
  const result = runStorageCheck('local');
  assert.equal(result.status, 2);
  assert.match(result.stdout, /production_storage_requires_s3/);
});

test('production allows the S3 provider before the first network operation', () => {
  const result = runStorageCheck('s3');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /allowed/);
});
