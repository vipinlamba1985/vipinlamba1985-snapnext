import { getUserFromRequest, isPreviewAuthAllowed, syncSupabaseUserToAppUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  hasSupabaseServiceRole,
  isSupabaseConfigured,
  supabaseServer,
} from '@/lib/supabase';
import {
  AuthApiError,
  parseLoginInput,
  parseRefreshInput,
  parseSignupInput,
  publicAuthUser,
} from './api-contract.js';

function requireSupabase() {
  if (!isSupabaseConfigured || !supabaseServer) {
    throw new AuthApiError('Supabase authentication is not configured', 503, 'auth_provider_not_configured');
  }
  return supabaseServer;
}

export function getAuthConfig() {
  return {
    supabase: isSupabaseConfigured,
    serviceRole: hasSupabaseServiceRole,
    previewAllowed: isPreviewAuthAllowed(),
  };
}

export async function signupAccount(body = {}) {
  const client = requireSupabase();
  const { email, password, name } = parseSignupInput(body);
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { name: name || email.split('@')[0], plan: 'free', role: 'user' } },
  });

  if (error) {
    const conflict = /already|registered|exists/i.test(error.message || '');
    throw new AuthApiError(
      conflict ? 'Email already in use' : (error.message || 'Signup failed'),
      conflict ? 409 : 400,
      conflict ? 'auth_email_in_use' : 'auth_signup_failed',
    );
  }
  if (!data?.user) throw new AuthApiError('Signup failed', 400, 'auth_signup_failed');

  const db = await getDb();
  const user = await syncSupabaseUserToAppUser(db, data.user);
  return {
    token: data.session?.access_token || null,
    refreshToken: data.session?.refresh_token || null,
    expiresAt: data.session?.expires_at || null,
    user: publicAuthUser(user),
    needsEmailConfirmation: !data.session,
  };
}

export async function loginAccount(body = {}) {
  const client = requireSupabase();
  const { email, password } = parseLoginInput(body);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token || !data?.user) {
    throw new AuthApiError('Invalid credentials', 401, 'auth_invalid_credentials');
  }

  const db = await getDb();
  const user = await syncSupabaseUserToAppUser(db, data.user);
  return {
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    user: publicAuthUser(user),
  };
}

export async function refreshAccountSession(body = {}) {
  const client = requireSupabase();
  const { refreshToken } = parseRefreshInput(body);
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session?.access_token || !data?.user) {
    throw new AuthApiError('Session expired', 401, 'auth_session_expired');
  }

  const db = await getDb();
  const user = await syncSupabaseUserToAppUser(db, data.user);
  return {
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    user: publicAuthUser(user),
  };
}

export async function getSessionAccount(request) {
  const user = await getUserFromRequest(request);
  if (!user) throw new AuthApiError('Unauthorized', 401, 'auth_unauthorized');
  return { user: publicAuthUser(user) };
}

export function logoutAccount() {
  // Browser/client session material is cleared by the SnapNext client. Supabase
  // access tokens are short-lived and server APIs revalidate them on use.
  return { ok: true };
}
