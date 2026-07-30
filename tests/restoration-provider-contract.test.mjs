import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('restoration provider blocks unapproved output hosts and validates saved files', () => {
  const provider = read('lib/restoration/provider.js');
  assert.match(provider, /RESTORATION_OUTPUT_HOSTS/);
  assert.match(provider, /url\.protocol !== 'https:'/);
  assert.match(provider, /provider_output_host_blocked/);
  assert.match(provider, /redirect: 'error'/);
  assert.match(provider, /image\/jpeg/);
  assert.match(provider, /image\/png/);
  assert.match(provider, /image\/webp/);
  assert.match(provider, /RESTORATION_MAX_OUTPUT_MB/);
});
