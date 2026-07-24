import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthApiError,
  parseLoginInput,
  parseRefreshInput,
  parseSignupInput,
  publicAuthUser,
} from '../lib/auth/api-contract.js';

test('signup input normalizes email and trims the display name', () => {
  assert.deepEqual(
    parseSignupInput({ email: '  User@Example.COM ', password: 'secret123', name: '  Vipin  ' }),
    { email: 'user@example.com', password: 'secret123', name: 'Vipin' },
  );
});

test('signup preserves the existing password minimum contract', () => {
  assert.throws(
    () => parseSignupInput({ email: 'user@example.com', password: '12345' }),
    (error) => error instanceof AuthApiError && error.code === 'auth_password_too_short' && error.status === 400,
  );
});

test('signup rejects malformed email addresses before provider calls', () => {
  assert.throws(
    () => parseSignupInput({ email: 'not-an-email', password: 'secret123' }),
    (error) => error instanceof AuthApiError && error.code === 'auth_email_invalid',
  );
});

test('login preserves normalized email and does not weaken credential requirements', () => {
  assert.deepEqual(
    parseLoginInput({ email: ' USER@example.com ', password: 'existing-password' }),
    { email: 'user@example.com', password: 'existing-password' },
  );
  assert.throws(
    () => parseLoginInput({ email: '', password: '' }),
    (error) => error instanceof AuthApiError && error.code === 'auth_credentials_required',
  );
});

test('refresh requires a bounded non-empty refresh token', () => {
  assert.deepEqual(parseRefreshInput({ refreshToken: ' refresh-token ' }), { refreshToken: 'refresh-token' });
  assert.throws(
    () => parseRefreshInput({}),
    (error) => error instanceof AuthApiError && error.code === 'auth_refresh_token_required',
  );
});

test('public auth user strips database and password fields', () => {
  assert.deepEqual(
    publicAuthUser({ _id: 'mongo-id', passwordHash: 'hidden', id: 'user-1', email: 'user@example.com', plan: 'free' }),
    { id: 'user-1', email: 'user@example.com', plan: 'free' },
  );
});
