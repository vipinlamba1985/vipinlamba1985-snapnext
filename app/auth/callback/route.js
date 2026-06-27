import { NextResponse } from 'next/server';
import { getSupabaseConfigStatus } from '@/lib/supabase';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get('next') ?? '/dashboard';
  const error = searchParams.get('error');
  if (error) return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);

  const accessToken = searchParams.get('access_token');
  const refreshToken = searchParams.get('refresh_token');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  if (type === 'recovery') {
    const resetUrl = new URL('/reset-password', origin);
    if (tokenHash) resetUrl.searchParams.set('token_hash', tokenHash);
    if (accessToken) resetUrl.searchParams.set('access_token', accessToken);
    if (refreshToken) resetUrl.searchParams.set('refresh_token', refreshToken);
    return NextResponse.redirect(resetUrl);
  }

  if (tokenHash && (type === 'email' || type === 'signup')) {
    const verifyUrl = new URL('/verify-email', origin);
    verifyUrl.searchParams.set('token_hash', tokenHash);
    return NextResponse.redirect(verifyUrl);
  }

  // Code exchange requires cookie-aware SSR helpers; this app uses token-bearing API auth instead.
  // If Supabase sends a code link, redirect safely to login rather than returning HTML/500.
  const status = getSupabaseConfigStatus();
  if (!status.configured) return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  return NextResponse.redirect(`${origin}${next}`);
}
