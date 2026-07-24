import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const passwordSchema = z.string().min(6).max(512);
const nameSchema = z.string().trim().max(120).optional();
const refreshTokenSchema = z.string().trim().min(1).max(8192);

export class AuthApiError extends Error {
  constructor(message, status = 400, code = 'auth_request_invalid') {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
  }
}

export function parseSignupInput(body = {}) {
  const email = String(body?.email || '').trim().toLowerCase();
  const password = typeof body?.password === 'string' ? body.password : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!email || !password) {
    throw new AuthApiError('Email & password required', 400, 'auth_credentials_required');
  }
  if (password.length < 6) {
    throw new AuthApiError('Password must be at least 6 characters', 400, 'auth_password_too_short');
  }

  const parsed = z.object({ email: emailSchema, password: passwordSchema, name: nameSchema }).safeParse({
    email,
    password,
    name: name || undefined,
  });
  if (!parsed.success) {
    const emailInvalid = !emailSchema.safeParse(email).success;
    throw new AuthApiError(
      emailInvalid ? 'Enter a valid email address' : 'Invalid signup details',
      400,
      emailInvalid ? 'auth_email_invalid' : 'auth_signup_invalid',
    );
  }
  return parsed.data;
}

export function parseLoginInput(body = {}) {
  const email = String(body?.email || '').trim().toLowerCase();
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) {
    throw new AuthApiError('Email & password required', 400, 'auth_credentials_required');
  }

  const parsed = z.object({ email: emailSchema, password: z.string().min(1).max(512) }).safeParse({ email, password });
  if (!parsed.success) {
    throw new AuthApiError('Invalid credentials', 401, 'auth_invalid_credentials');
  }
  return parsed.data;
}

export function parseRefreshInput(body = {}) {
  const parsed = z.object({ refreshToken: refreshTokenSchema }).safeParse(body || {});
  if (!parsed.success) {
    throw new AuthApiError('Refresh token required', 400, 'auth_refresh_token_required');
  }
  return parsed.data;
}

export function publicAuthUser(user) {
  if (!user) return user;
  const { _id, passwordHash, ...safe } = user;
  return safe;
}
