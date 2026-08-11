import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../next.config.js', import.meta.url), 'utf8');

test('launch ships an enforced CSP and a stricter report-only policy', () => {
  assert.match(config, /key:\s*['"]Content-Security-Policy['"]/);
  assert.match(config, /key:\s*['"]Content-Security-Policy-Report-Only['"]/);
});

test('enforced CSP keeps the high-value browser security boundaries', () => {
  assert.match(config, /object-src 'none'/);
  assert.match(config, /base-uri 'self'/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /script-src 'self'/);
  assert.match(config, /connect-src 'self' blob: https: wss:/);
});

test('enforced CSP keeps provider compatibility while strict policy observes narrowing', () => {
  assert.match(config, /script-src[^\n]*https:\/\/js\.stripe\.com/);
  assert.match(config, /script-src[^\n]*https:\/\/\*\.google\.com/);
  assert.match(config, /script-src[^\n]*https:\/\/\*\.gstatic\.com/);
  assert.match(config, /frame-src 'self' https:/);
  assert.match(config, /cspStrictReportOnlyDirectives/);
  assert.match(config, /https:\/\/www\.dropbox\.com/);
  assert.match(config, /https:\/\/accounts\.google\.com/);
});
