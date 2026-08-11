import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isAllowedOrigin,
  parseConfiguredOrigins,
  resolveAllowedOrigins,
} from '../lib/request-origin.js';

// The regression this file exists for: the previous implementation compared the
// browser Origin against `request.nextUrl.origin`, which is a literal
// `http://localhost:<port>` on a self-hosted Node server. Every same-origin
// write from a real browser was rejected with origin_not_allowed.
test('same-origin browser write is accepted behind a TLS proxy with no CORS_ORIGINS set', () => {
  const allowed = resolveAllowedOrigins({
    configured: '',
    forwardedHost: 'snapnext.ai',
    host: 'snapnext.ai',
    forwardedProto: 'https',
    fallbackProtocol: 'http:',
  });
  assert.equal(isAllowedOrigin('https://snapnext.ai', allowed), true);
});

test('the localhost fallback origin is never what a deployed browser is measured against', () => {
  const allowed = resolveAllowedOrigins({
    forwardedHost: 'snapnext.ai',
    forwardedProto: 'https',
    fallbackProtocol: 'http:',
  });
  assert.equal(allowed.has('http://localhost:3000'), false);
  assert.equal(isAllowedOrigin('http://localhost:3000', allowed), false);
});

test('a cross-site origin is still rejected', () => {
  const allowed = resolveAllowedOrigins({
    forwardedHost: 'snapnext.ai',
    forwardedProto: 'https',
  });
  assert.equal(isAllowedOrigin('https://evil.example', allowed), false);
});

test('local http development is accepted without configuration', () => {
  const allowed = resolveAllowedOrigins({
    host: 'localhost:3000',
    fallbackProtocol: 'http:',
  });
  assert.equal(isAllowedOrigin('http://localhost:3000', allowed), true);
});

test('CORS_ORIGINS is additive and does not disable the derived origin', () => {
  const allowed = resolveAllowedOrigins({
    configured: 'https://admin.snapnext.ai, https://studio.snapnext.ai',
    forwardedHost: 'snapnext.ai',
    forwardedProto: 'https',
  });
  assert.equal(isAllowedOrigin('https://admin.snapnext.ai', allowed), true);
  assert.equal(isAllowedOrigin('https://studio.snapnext.ai', allowed), true);
  assert.equal(isAllowedOrigin('https://snapnext.ai', allowed), true);
});

test('forwarded headers carrying a proxy chain use the first hop', () => {
  const allowed = resolveAllowedOrigins({
    forwardedHost: 'snapnext.ai, internal.local',
    forwardedProto: 'https, http',
  });
  assert.equal(isAllowedOrigin('https://snapnext.ai', allowed), true);
  assert.equal(isAllowedOrigin('http://internal.local', allowed), false);
});

test('x-forwarded-host wins over the raw Host header', () => {
  const allowed = resolveAllowedOrigins({
    forwardedHost: 'snapnext.ai',
    host: 'snapnext.internal:3000',
    forwardedProto: 'https',
  });
  assert.equal(isAllowedOrigin('https://snapnext.ai', allowed), true);
});

test('a request without an Origin header is left to authentication and rate limiting', () => {
  const allowed = resolveAllowedOrigins({ host: 'snapnext.ai' });
  assert.equal(isAllowedOrigin(null, allowed), true);
  assert.equal(isAllowedOrigin('', allowed), true);
});

test('configured origins parse tolerantly and drop blanks', () => {
  assert.deepEqual(
    parseConfiguredOrigins(' https://a.example , ,https://b.example '),
    ['https://a.example', 'https://b.example'],
  );
  assert.deepEqual(parseConfiguredOrigins(undefined), []);
});

test('an unproxied request with no scheme hint assumes TLS rather than plaintext', () => {
  const allowed = resolveAllowedOrigins({ host: 'snapnext.ai' });
  assert.equal(isAllowedOrigin('https://snapnext.ai', allowed), true);
});
