import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app/(app)/upload/discover/DiscoveryFlow.js', import.meta.url), 'utf8');

test('mobile upload guidance recommends computer for large backups without promising speed', () => {
  assert.match(source, /data-testid="mobile-large-backup-tip"/);
  assert.match(source, /SnapNext is easier on a computer/);
  assert.match(source, /Your phone is perfect for quick everyday backups/);
  assert.match(source, /md:hidden/);
  assert.doesNotMatch(source, /computer[^\n]{0,80}faster|faster[^\n]{0,80}computer/i);
});

test('large mobile batches get a non-blocking follow-up coach', () => {
  assert.match(source, /LARGE_MOBILE_BATCH_FILES = 100/);
  assert.match(source, /LARGE_MOBILE_BATCH_BYTES = 1024 \*\* 3/);
  assert.match(source, /flow\.report\.total >= LARGE_MOBILE_BATCH_FILES \|\| flow\.report\.bytes >= LARGE_MOBILE_BATCH_BYTES/);
  assert.match(source, /data-testid="mobile-large-batch-coach"/);
  assert.match(source, /You can continue this backup here/);
  assert.match(source, /For future large library moves/);
});
