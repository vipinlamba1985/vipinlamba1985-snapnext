import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function cleanSupabaseUser(authUser) {
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

async function upsertProfile(authUser, name) {
  if (!supabaseAdmin || !authUser?.id) return;
  try {
    await supabaseAdmin.from('profiles').upsert({
      id: authUser.id,
      email: authUser.email,
      name: name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
      plan: authUser.app_metadata?.plan || 'free',
      role: authUser.app_metadata?.role || 'user',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('[auth/signup] profile upsert skipped:', e?.message);
  }
}

export async function POST(request) {
  try {
    if (!isSupabaseConfigured || !supabase) {
      return json({ error: 'Authentication is not configured. Please contact support.' }, 503);
    }

    const { email, password, name } = await request.json().catch(() => ({}));
    if (!email || !password) return json({ error: 'Email & password required' }, 400);
    if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

    const displayName = name || email.split('@')[0];
    const { data, error } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: { data: { name: displayName, full_name: displayName } },
    });

    if (error) return json({ error: error.message || 'Signup failed' }, 400);
    if (data?.user) await upsertProfile(data.user, displayName);

    if (!data?.session?.access_token) {
      return json({
        ok: true,
        requiresEmailConfirmation: true,
        user: data?.user ? cleanSupabaseUser(data.user) : null,
        message: 'Account created. Please check your email to verify your account before signing in.',
      });
    }

    return json({ token: data.session.access_token, user: cleanSupabaseUser(data.user) });
  } catch (e) {
    console.error('[auth/signup] error:', e);
    return json({ error: e?.message || 'Signup failed. Please try again.' }, 500);
  }
}
