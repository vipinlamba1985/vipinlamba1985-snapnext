import test from 'node:test';
import assert from 'node:assert/strict';
import { getRequestAuthToken } from '../lib/auth.js';

function requestWith({ authorization = null, cookie = null, directCookie = null } = {}) {
  return {
    headers: {
      get(name) {
        const key = String(name || '').toLowerCase();
        if (key === 'authorization') return authorization;
        if (key === 'cookie') return cookie;
        return null;
      },
    },
    cookies: directCookie ? {
      get(name) {
        return name === 'sb-access-token' ? { value: directCookie } : undefined;
      },
    } : undefined,
  };
}

test('request auth token prefers Authorization bearer token', () => {
  const token = getRequestAuthToken(requestWith({
    authorization: 'Bearer bearer-token',
    directCookie: 'cookie-token',
  }));
  assert.equal(token, 'bearer-token');
});

test('request auth token accepts the same-site session cookie', () => {
  assert.equal(getRequestAuthToken(requestWith({ directCookie: 'cookie-token' })), 'cookie-token');
});

test('request auth token parses encoded cookie headers when Next cookies are unavailable', () => {
  const token = 'header.token/value';
  const encoded = encodeURIComponent(token);
  assert.equal(
    getRequestAuthToken(requestWith({ cookie: `theme=dark; sb-access-token=${encoded}; other=1` })),
    token,
  );
});

test('request auth token returns null without credentials', () => {
  assert.equal(getRequestAuthToken(requestWith()), null);
});
