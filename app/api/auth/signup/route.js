import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function env(name) {
  return (process.env[name] || '').trim();
}

function getSupabaseClient() {
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const anon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cleanUser(authUser) {
  const meta = authUser?.user_metadata || {};
  const appMeta = authUser?.app_metadata || {};
  return {
    id: authUser?.id,
    email: authUser?.email || '',
    name: meta.name || meta.full_name || authUser?.email?.split('@')[0] || 'User',
    plan: appMeta.plan || meta.plan || 'free',
    role: appMeta.role || meta.role || 'user',
    emailVerified: !!authUser?.email_confirmed_at,
    emailPrefs: meta.emailPrefs || { product: true, community: true, favorites: true, marketing: false },
    avatarColor: meta.avatarColor || '#a855f7',
    createdAt: authUser?.created_at || new Date().toISOString(),
    authProvider: 'supabase',
  };
}

export async function POST(request) {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return json({ error: 'Authentication service is missing required deployment configuration.' }, 503);
    }

    const { email, password, name } = await request.json().catch(() => ({}));
    if (!email || !password) return json({ error: 'Email & password required' }, 400);
    if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

    const displayName = name || email.split('@')[0];
    const { data, error } = await client.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: { data: { name: displayName, full_name: displayName } },
    });

    if (error) return json({ error: error.message || 'Signup failed' }, 400);

    if (!data?.session?.access_token) {
      return json({
        ok: true,
        requiresEmailConfirmation: true,
        user: data?.user ? cleanUser(data.user) : null,
        message: 'Account created. Please check your email to verify your account before signing in.',
      });
    }

    return json({ token: data.session.access_token, user: cleanUser(data.user) });
  } catch (e) {
    console.error('[auth/signup] error:', e?.message || e);
    return json({ error: 'Signup failed. Please try again.' }, 500);
  }
}
